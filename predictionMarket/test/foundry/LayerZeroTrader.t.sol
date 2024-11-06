// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { LayerZeroPolyTrader } from "../../contracts/LayerZeroPolyTrader.sol";
import { PolymarketPositionManager } from "../../contracts/PolymarketPositionManager.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "forge-std/console.sol";
import "forge-std/Test.sol";

// Import mocks
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockCTF } from "./mocks/MockCTF.sol";
import { MockExchange } from "./mocks/MockExchange.sol";
import { MockStargate } from "./mocks/MockStargate.sol";

contract LayerZeroPolyTraderTest is Test {
    LayerZeroPolyTrader public trader;
    PolymarketPositionManager public positionManager;
    MockUSDC public usdc;
    MockCTF public ctf;
    MockExchange public exchange;
    MockStargate public stargate;

    // Roles
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Test addresses
    address public owner;
    address public user;
    address public signer;
    uint16 public constant SRC_CHAIN_ID = 10; // Optimism chain ID

    // Test data
    bytes32 public constant TEST_QUESTION_ID = keccak256("Will ETH reach $5000 by end of 2024?");
    bytes32 public constant TEST_CONDITION_ID = keccak256(abi.encodePacked(address(0), TEST_QUESTION_ID, uint256(2)));
    uint256 public yesTokenId;
    uint256 public noTokenId;
    uint64 public constant TEST_NONCE = 1;

    function setUp() public {
        owner = address(this);
        user = address(0xB0B);
        signer = address(0xB0B1);

        // Deploy mock contracts
        usdc = new MockUSDC();
        ctf = new MockCTF();
        exchange = new MockExchange(address(usdc), address(ctf));
        stargate = new MockStargate(address(usdc));

        // Deploy main contracts
        positionManager = new PolymarketPositionManager(address(exchange), address(ctf), address(usdc), signer, owner);

        trader = new LayerZeroPolyTrader(address(positionManager), address(stargate), address(usdc), owner);

        // Setup roles
        positionManager.grantRole(TRADER_ROLE, address(trader));
        positionManager.grantRole(OPERATOR_ROLE, owner);

        // Setup test market
        ctf.prepareCondition(address(0), TEST_QUESTION_ID, 2);
        (yesTokenId, noTokenId) = positionManager.getMarketTokenIds(TEST_CONDITION_ID);

        // Setup initial balances and approvals
        setupBalancesAndApprovals();
    }

    function setupBalancesAndApprovals() internal {
        // Mint USDC
        usdc.mint(user, 10000 * 10 ** 6);
        usdc.mint(address(exchange), 10000 * 10 ** 6);
        usdc.mint(address(positionManager), 10000 * 10 ** 6);
        usdc.mint(address(stargate), 10000 * 10 ** 6);
        usdc.mint(address(trader), 10000 * 10 ** 6);

        // Mint position tokens to exchange
        ctf.mintTest(address(exchange), yesTokenId, 10000 * 10 ** 6);
        ctf.mintTest(address(exchange), noTokenId, 10000 * 10 ** 6);

        // Setup approvals
        vm.prank(user);
        usdc.approve(address(stargate), type(uint256).max);

        vm.startPrank(address(positionManager));
        ctf.setApprovalForAll(address(exchange), true);
        usdc.approve(address(exchange), type(uint256).max);
        vm.stopPrank();

        vm.prank(address(trader));
        usdc.approve(address(positionManager), type(uint256).max);
    }

    function test_sgReceive_BuyPosition() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        uint256 usdcAmount = (amount * price) / 1e6;

        // Need to ensure there's enough USDC in the trader contract
        usdc.mint(address(trader), usdcAmount);

        bytes memory payload = abi.encode(user, yesTokenId, amount, price, true);

        vm.startPrank(address(stargate));
        stargate.deliverMessage(address(trader), payload, usdcAmount);
        vm.stopPrank();

        assertEq(ctf.balanceOf(user, yesTokenId), amount, "User did not receive position tokens");
    }

    function test_RevertUnauthorizedCaller() public {
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.startPrank(address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.UnauthorizedCaller.selector, address(0xBAD), address(stargate))
        );
        trader.sgReceive(SRC_CHAIN_ID, "", TEST_NONCE, address(usdc), amount, payload);
        vm.stopPrank();
    }

    function test_RevertInvalidToken() public {
        address invalidToken = address(0xBAD);
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.startPrank(address(stargate));
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyTrader.InvalidToken.selector, invalidToken, address(usdc)));
        trader.sgReceive(SRC_CHAIN_ID, "", TEST_NONCE, invalidToken, amount, payload);
        vm.stopPrank();
    }

    function test_RevertDuplicateMessage() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        uint256 usdcAmount = (amount * price) / 1e6;

        // Ensure enough USDC balance
        usdc.mint(address(trader), usdcAmount * 2);

        bytes memory payload = abi.encode(user, yesTokenId, amount, price, true);

        vm.startPrank(address(stargate));

        // First call should succeed
        stargate.deliverMessage(address(trader), payload, usdcAmount);

        // Second call should fail with duplicate message error
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.CrossChainOperationFailed.selector, "Message already processed")
        );
        stargate.deliverMessage(address(trader), payload, usdcAmount);
        vm.stopPrank();
    }

    function test_RevertBuyPositionFailed() public {
        uint256 amount = 1000000 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        uint256 usdcAmount = (amount * price) / 1e6;

        // Ensure the trader has enough USDC for the transfer but not enough for the position
        usdc.mint(address(stargate), usdcAmount);

        bytes memory payload = abi.encode(user, yesTokenId, amount, price, true);

        vm.startPrank(address(stargate));

        // First, make sure the stargate mock is properly funded
        usdc.approve(address(trader), usdcAmount);

        bytes memory expectedError = abi.encodeWithSelector(
            LayerZeroPolyTrader.CrossChainOperationFailed.selector,
            string("Buy position failed: InsufficientBalance")
        );

        vm.expectRevert(expectedError);
        stargate.deliverMessage(address(trader), payload, usdcAmount);

        vm.stopPrank();
    }

    function logBalances() internal view {
        console.log("\n=== Balance Report ===");
        console.log("User USDC:", usdc.balanceOf(user));
        console.log("Position Manager USDC:", usdc.balanceOf(address(positionManager)));
        console.log("Trader USDC:", usdc.balanceOf(address(trader)));
        console.log("User YES Token:", ctf.balanceOf(user, yesTokenId));
        console.log("==================\n");
    }
}
