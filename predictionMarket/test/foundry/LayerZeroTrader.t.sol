// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { LayerZeroPolyTrader } from "../../contracts/LayerZeroPolyTrader.sol";
import { PolymarketPositionManager } from "../../contracts/PolymarketPositionManager.sol";
import { OAppOptionsType3 } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "forge-std/console.sol";
import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";

// Import mocks
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockCTF } from "./mocks/MockCTF.sol";
import { MockExchange } from "./mocks/MockExchange.sol";
import { MockStargate } from "./mocks/MockStargate.sol";

contract LayerZeroPolyTraderTest is TestHelperOz5 {
    // Chain IDs
    uint32 private constant OPTIMISM_EID = 40232;
    uint32 private constant POLYGON_EID = 40161;

    // Contracts
    LayerZeroPolyTrader private optimismTrader;
    LayerZeroPolyTrader private polygonTrader;
    PolymarketPositionManager private positionManager;
    MockUSDC private usdc;
    MockCTF private ctf;
    MockExchange private exchange;
    MockStargate private stargateOptimism;
    MockStargate private stargatePolygon;

    // Roles
    bytes32 private constant TRADER_ROLE = keccak256("TRADER_ROLE");
    bytes32 private constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Test addresses
    address private userA = address(0x1);
    address private userB = address(0x2);
    address private signer = address(0x3);
    address private owner = address(0x4);

    // Test data
    bytes32 public constant TEST_QUESTION_ID = keccak256("Will ETH reach $5000 by end of 2024?");
    bytes32 public constant TEST_CONDITION_ID = keccak256(abi.encodePacked(address(0), TEST_QUESTION_ID, uint256(2)));
    uint256 public yesTokenId;
    uint256 public noTokenId;

    function setUp() public virtual override {
        super.setUp();

        // Setup basic accounts
        vm.deal(userA, 1000 ether);
        vm.deal(userB, 1000 ether);
        vm.deal(owner, 1000 ether);

        // Deploy mock contracts
        usdc = new MockUSDC();
        ctf = new MockCTF();
        exchange = new MockExchange(address(usdc), address(ctf));
        stargateOptimism = new MockStargate(address(usdc));
        stargatePolygon = new MockStargate(address(usdc));

        // Deploy position manager with owner
        positionManager = new PolymarketPositionManager(address(exchange), address(ctf), address(usdc), signer, owner);

        // Deploy traders with Stargate integration
        optimismTrader = new LayerZeroPolyTrader(
            address(positionManager),
            address(stargateOptimism),
            address(usdc),
            POLYGON_EID,
            owner
        );

        polygonTrader = new LayerZeroPolyTrader(
            address(positionManager),
            address(stargatePolygon),
            address(usdc),
            OPTIMISM_EID,
            owner
        );

        // Setup roles for traders
        vm.startPrank(owner);
        positionManager.grantRole(TRADER_ROLE, address(optimismTrader));
        positionManager.grantRole(TRADER_ROLE, address(polygonTrader));
        vm.stopPrank();

        // Setup test market
        ctf.prepareCondition(address(0), TEST_QUESTION_ID, 2);
        (yesTokenId, noTokenId) = positionManager.getMarketTokenIds(TEST_CONDITION_ID);

        // Setup initial balances and approvals
        setupBalancesAndApprovals();
    }

    function setupBalancesAndApprovals() internal {
        // Mint USDC
        usdc.mint(userA, 10000 * 10 ** 6);
        usdc.mint(address(exchange), 10000 * 10 ** 6);
        usdc.mint(address(positionManager), 10000 * 10 ** 6);
        usdc.mint(address(stargateOptimism), 10000 * 10 ** 6);
        usdc.mint(address(stargatePolygon), 10000 * 10 ** 6);
        usdc.mint(address(polygonTrader), 10000 * 10 ** 6);
        usdc.mint(address(optimismTrader), 10000 * 10 ** 6);

        // Mint position tokens to exchange
        ctf.mintTest(address(exchange), yesTokenId, 10000 * 10 ** 6);
        ctf.mintTest(address(exchange), noTokenId, 10000 * 10 ** 6);

        // Setup approvals
        vm.startPrank(userA);
        usdc.approve(address(optimismTrader), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(address(positionManager));
        ctf.setApprovalForAll(address(exchange), true);
        usdc.approve(address(exchange), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(address(polygonTrader));
        usdc.approve(address(positionManager), type(uint256).max);
        vm.stopPrank();
    }

    function test_SendBuyOrder() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        uint256 usdcAmount = (amount * price) / 1e6;
        uint256 initialUserUSDC = usdc.balanceOf(userA);
        uint256 initialStargateUSDC = usdc.balanceOf(address(stargateOptimism));

        vm.startPrank(userA);
        optimismTrader.sendBuyOrder{ value: 0.01 ether }(yesTokenId, amount, price, options);
        vm.stopPrank();

        assertEq(usdc.balanceOf(userA), initialUserUSDC - usdcAmount, "User USDC balance incorrect");
        assertEq(
            usdc.balanceOf(address(stargateOptimism)),
            initialStargateUSDC + usdcAmount,
            "Stargate USDC balance incorrect"
        );

        // Simulate cross-chain message
        bytes memory payload = abi.encode(
            userA,
            yesTokenId,
            amount,
            price,
            true // isBuy
        );

        vm.startPrank(address(stargatePolygon));
        stargatePolygon.deliverMessage(address(polygonTrader), payload, usdcAmount);
        vm.stopPrank();

        assertEq(ctf.balanceOf(userA, yesTokenId), amount, "User did not receive position tokens");
    }

    function test_InvalidAmount() public {
        uint256 amount = 0;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        vm.startPrank(userA);
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.InvalidAmount.selector, 0, "USDC amount must be greater than 0")
        );
        optimismTrader.sendBuyOrder{ value: 0.01 ether }(yesTokenId, amount, price, options);
        vm.stopPrank();
    }

    function test_InsufficientNativeFee() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        vm.startPrank(userA);
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyTrader.InsufficientNativeFee.selector, 0.01 ether, 0));
        optimismTrader.sendBuyOrder(yesTokenId, amount, price, options);
        vm.stopPrank();
    }

    function test_UnauthorizedCaller() public {
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.startPrank(address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(
                LayerZeroPolyTrader.UnauthorizedCaller.selector,
                address(0xBAD),
                address(stargatePolygon)
            )
        );
        polygonTrader.sgReceive(1, "", 0, address(usdc), amount, payload);
        vm.stopPrank();
    }

    function test_InvalidToken() public {
        address invalidToken = address(0xBAD);
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.startPrank(address(stargatePolygon));
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyTrader.InvalidToken.selector, invalidToken, address(usdc)));
        polygonTrader.sgReceive(1, "", 0, invalidToken, amount, payload);
        vm.stopPrank();
    }

    function test_DuplicateMessage() public {
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = abi.encode(userA, yesTokenId, amount, 0.5 * 10 ** 6, true);

        vm.startPrank(address(stargatePolygon));
        // First call should succeed
        stargatePolygon.deliverMessage(address(polygonTrader), payload, amount);

        // Second call should fail with the require message from MockStargate
        vm.expectRevert("Message delivery failed");
        stargatePolygon.deliverMessage(address(polygonTrader), payload, amount);
        vm.stopPrank();
    }

    function logBalances() internal view {
        console.log("\n=== Balance Report ===");
        console.log("User A USDC:", usdc.balanceOf(userA));
        console.log("Position Manager USDC:", usdc.balanceOf(address(positionManager)));
        console.log("Optimism Trader USDC:", usdc.balanceOf(address(optimismTrader)));
        console.log("Polygon Trader USDC:", usdc.balanceOf(address(polygonTrader)));
        console.log("User A YES Token:", ctf.balanceOf(userA, yesTokenId));
        console.log("==================\n");
    }
}
