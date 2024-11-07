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
    address public endpoint;

    // Roles
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Test addresses
    address public owner;
    address public user;
    address public signer;

    // Test data
    bytes32 public constant TEST_QUESTION_ID = keccak256("Will ETH reach $5000 by end of 2024?");
    bytes32 public constant TEST_CONDITION_ID = keccak256(abi.encodePacked(address(0), TEST_QUESTION_ID, uint256(2)));
    uint256 public yesTokenId;
    uint256 public noTokenId;

    // Test address constants
    address constant OWNER = address(0x1);
    address constant USER = address(0xB0B);
    address constant SIGNER = address(0xB0B1);
    address constant ENDPOINT = address(0xE9D5);

    // Events
    event OrderExecuted(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    event RefundIssued(address indexed trader, uint256 amount, string reason);

    event ApprovalUpdated(address indexed token, address indexed spender, uint256 amount);

    // In the setUp function:
    function setUp() public {
        owner = address(this);
        user = address(0xB0B);
        signer = address(0xB0B1);
        endpoint = address(0xE9D5);

        // Deploy mock contracts
        usdc = new MockUSDC();
        ctf = new MockCTF();
        exchange = new MockExchange(address(usdc), address(ctf));
        stargate = new MockStargate(address(usdc));

        // Deploy main contracts
        positionManager = new PolymarketPositionManager(
            address(exchange),
            address(ctf),
            address(usdc),
            signer,
            owner // This sets the owner as the admin
        );

        trader = new LayerZeroPolyTrader(address(positionManager), address(stargate), address(usdc), endpoint, owner);

        // Setup roles - make sure we're the admin first
        vm.startPrank(owner); // Important: use owner address for these calls
        positionManager.grantRole(TRADER_ROLE, address(trader));
        positionManager.grantRole(OPERATOR_ROLE, owner);
        vm.stopPrank();

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
        vm.prank(address(trader));
        usdc.approve(address(positionManager), type(uint256).max);
    }

    function test_lzCompose_BuyPosition() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        uint256 usdcAmount = (amount * price) / 1e6;

        // Ensure trader has enough USDC
        usdc.mint(address(trader), usdcAmount);

        bytes memory message = abi.encode(user, yesTokenId, amount, price, true, usdcAmount);

        bytes32 guid = keccak256("test-guid");

        vm.startPrank(endpoint);
        vm.expectEmit(true, true, false, true);
        emit OrderExecuted(keccak256(message), user, yesTokenId, amount, price, true);

        trader.lzCompose(address(stargate), guid, message, address(0), "");
        vm.stopPrank();

        assertEq(ctf.balanceOf(user, yesTokenId), amount, "User did not receive position tokens");
    }

    function test_RevertUnauthorizedEndpoint() public {
        bytes memory message = "";
        bytes32 guid = keccak256("test-guid");

        vm.prank(address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.UnauthorizedCaller.selector, address(0xBAD), endpoint)
        );
        trader.lzCompose(address(stargate), guid, message, address(0), "");
    }

    function test_RevertUnauthorizedSource() public {
        bytes memory message = "";
        bytes32 guid = keccak256("test-guid");

        vm.prank(endpoint);
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.UnauthorizedCaller.selector, address(0xBAD), address(stargate))
        );
        trader.lzCompose(address(0xBAD), guid, message, address(0), "");
    }

    function test_RevertInsufficientBalance() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        uint256 usdcAmount = (amount * price) / 1e6;

        // Don't mint any USDC to trader
        usdc.burn(address(trader), usdc.balanceOf(address(trader)));

        bytes memory message = abi.encode(user, yesTokenId, amount, price, true, usdcAmount);

        bytes32 guid = keccak256("test-guid");

        vm.prank(endpoint);
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyTrader.InsufficientBalance.selector, usdcAmount, 0));
        trader.lzCompose(address(stargate), guid, message, address(0), "");
    }

    function test_BuyPositionFailureRefund() public {
        uint256 amount = 100 * 10 ** 6; // 100M tokens
        uint256 price = 0.5 * 10 ** 6; // 0.5 USDC per token
        uint256 usdcAmount = (amount * price) / 1e6; // 50M USDC

        // Reset balances using burn
        usdc.burn(address(trader), usdc.balanceOf(address(trader)));
        usdc.burn(user, usdc.balanceOf(user));
        usdc.burn(address(positionManager), usdc.balanceOf(address(positionManager)));

        // Set up clean initial state
        usdc.mint(user, 10000000000);
        usdc.mint(address(trader), usdcAmount);
        // Give PositionManager enough USDC
        usdc.mint(address(positionManager), 10000000000);

        // Enable exchange fail mode
        exchange.setFailMode(true);

        bytes memory message = abi.encode(user, yesTokenId, amount, price, true, usdcAmount);
        bytes32 guid = keccak256("test-guid");

        uint256 initialUserBalance = usdc.balanceOf(user);

        vm.startPrank(endpoint);

        // Record state before operation
        uint256 preOpUserBalance = usdc.balanceOf(user);

        vm.expectEmit(true, true, false, true);
        emit RefundIssued(user, usdcAmount, "Buy position failed");

        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyTrader.CrossChainOperationFailed.selector, "Buy position failed")
        );

        trader.lzCompose(address(stargate), guid, message, address(0), "");

        vm.stopPrank();

        // Verify final balances after revert
        assertEq(usdc.balanceOf(user), preOpUserBalance + usdcAmount, "USDC not properly refunded");
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
