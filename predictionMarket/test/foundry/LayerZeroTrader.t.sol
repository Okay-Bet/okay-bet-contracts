// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { LayerZeroPolyTrader } from "../../contracts/LayerZeroPolyTrader.sol";
import { PolymarketPositionManager } from "../../contracts/PolymarketPositionManager.sol";
import { IOAppOptionsType3 } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "forge-std/console.sol";
import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";

// Import our mock contracts
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockCTF } from "./mocks/MockCTF.sol";
import { MockExchange } from "./mocks/MockExchange.sol";

contract LayerZeroPolyTraderTest is TestHelperOz5 {
    using OptionsBuilder for bytes;

    // Chain IDs
    uint32 private optimismEid = 1;
    uint32 private polygonEid = 2;

    // Contracts
    LayerZeroPolyTrader private optimismTrader;
    LayerZeroPolyTrader private polygonTrader;
    PolymarketPositionManager private positionManager;
    MockUSDC private usdc;
    MockCTF private ctf;
    MockExchange private exchange;

    // Test addresses
    address private userA = address(0x1);
    address private userB = address(0x2);
    address private signer = address(0x3);

    // Test data
    bytes32 public constant TEST_QUESTION_ID = keccak256("Will ETH reach $5000 by end of 2024?");
    bytes32 public constant TEST_CONDITION_ID = keccak256(abi.encodePacked(address(0), TEST_QUESTION_ID, uint256(2)));
    uint256 public yesTokenId;
    uint256 public noTokenId;

    function setUp() public virtual override {
        // Setup basic accounts
        vm.deal(userA, 1000 ether);
        vm.deal(userB, 1000 ether);

        // Setup LayerZero endpoints
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy mock contracts
        usdc = new MockUSDC();
        ctf = new MockCTF();
        exchange = new MockExchange(address(usdc), address(ctf));

        // Deploy position manager
        positionManager = new PolymarketPositionManager(address(exchange), address(ctf), address(usdc), signer);

        // Deploy traders
        optimismTrader = LayerZeroPolyTrader(
            _deployOApp(
                type(LayerZeroPolyTrader).creationCode,
                abi.encode(address(endpoints[optimismEid]), address(this), address(positionManager), address(usdc))
            )
        );

        polygonTrader = LayerZeroPolyTrader(
            _deployOApp(
                type(LayerZeroPolyTrader).creationCode,
                abi.encode(address(endpoints[polygonEid]), address(this), address(positionManager), address(usdc))
            )
        );

        // Wire up the apps
        address[] memory oapps = new address[](2);
        oapps[0] = address(optimismTrader);
        oapps[1] = address(polygonTrader);
        this.wireOApps(oapps);

        // Setup test market
        ctf.prepareCondition(address(0), TEST_QUESTION_ID, 2);
        (yesTokenId, noTokenId) = positionManager.getMarketTokenIds(TEST_CONDITION_ID);

        // Setup initial balances and approvals
        setupBalancesAndApprovals();
    }

    function setupBalancesAndApprovals() internal {
        // Mint tokens
        usdc.mint(userA, 10000 * 10 ** 6);
        usdc.mint(address(exchange), 10000 * 10 ** 6);

        // Mint position tokens to exchange
        ctf.mintTest(address(exchange), yesTokenId, 10000 * 10 ** 6);
        ctf.mintTest(address(exchange), noTokenId, 10000 * 10 ** 6);

        // Setup approvals
        vm.startPrank(userA);
        usdc.approve(address(optimismTrader), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(address(positionManager));
        ctf.setApprovalForAll(address(exchange), true);
        vm.stopPrank();
    }

    function test_CrossChainBuy() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        // Create full options set
        bytes memory options = createWorkerOptions(
            200000, // gas limit
            abi.encodePacked( // adapter params
                    uint16(1), // version
                    uint256(200000) // gas
                )
        );

        uint256 initialManagerUSDC = usdc.balanceOf(address(positionManager));
        uint256 initialUserUSDC = usdc.balanceOf(userA);

        vm.startPrank(userA);
        optimismTrader.sendBuyOrder{ value: 1 ether }(polygonEid, yesTokenId, amount, price, options);
        vm.stopPrank();

        // Assert final states
        assertEq(
            usdc.balanceOf(address(positionManager)),
            initialManagerUSDC + (amount * price) / 10 ** 6,
            "Incorrect manager USDC balance"
        );
        assertEq(usdc.balanceOf(userA), initialUserUSDC - (amount * price) / 10 ** 6, "Incorrect user USDC balance");
        assertEq(ctf.balanceOf(address(positionManager), yesTokenId), amount, "Incorrect position token balance");
    }

    // Add a helper function to print balances for debugging
    function logBalances() internal view {
        console.log("User A USDC Balance:", usdc.balanceOf(userA));
        console.log("Position Manager USDC Balance:", usdc.balanceOf(address(positionManager)));
        console.log("Exchange USDC Balance:", usdc.balanceOf(address(exchange)));
        console.log("Position Manager YES Token Balance:", ctf.balanceOf(address(positionManager), yesTokenId));
        console.log("Exchange YES Token Balance:", ctf.balanceOf(address(exchange), yesTokenId));
    }
}
