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
    uint32 private constant OPTIMISM_EID = 40232; // Optimism Sepolia
    uint32 private constant POLYGON_EID = 40161; // Polygon Mumbai

    // Contracts
    LayerZeroPolyTrader private optimismTrader;
    LayerZeroPolyTrader private polygonTrader;
    PolymarketPositionManager private positionManager;
    MockUSDC private usdc;
    MockCTF private ctf;
    MockExchange private exchange;
    MockStargate private stargateOptimism;
    MockStargate private stargatePolygon;

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

        // Authorize traders in position manager
        vm.startPrank(owner);
        positionManager.setAuthorizedTrader(address(optimismTrader), true);
        positionManager.setAuthorizedTrader(address(polygonTrader), true);
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

        vm.startPrank(address(optimismTrader));
        usdc.approve(address(stargateOptimism), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(address(stargatePolygon));
        usdc.approve(address(polygonTrader), type(uint256).max);
        vm.stopPrank();
    }

    function test_SendBuyOrder() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        uint256 usdcAmount = (amount * price) / 1e6;
        uint256 initialUserUSDC = usdc.balanceOf(userA);

        console.log("Initial setup complete. Starting balances:");
        logBalances();

        console.log("Initial approvals set. Starting buy order...");

        // Send buy order from userA
        vm.startPrank(userA);
        optimismTrader.sendBuyOrder{ value: 0.01 ether }(yesTokenId, amount, price, options);
        vm.stopPrank();

        // Verify the initial state after order sending
        assertEq(usdc.balanceOf(userA), initialUserUSDC - usdcAmount, "User USDC balance incorrect");
        assertEq(usdc.balanceOf(address(stargateOptimism)), usdcAmount, "Stargate USDC balance incorrect");

        // Prepare cross-chain message simulation
        bytes memory payload = abi.encode(
            userA,
            yesTokenId,
            amount,
            price,
            true // isBuy
        );

        console.log("Delivering cross-chain message...");

        // Simulate the cross-chain message
        vm.startPrank(address(stargatePolygon));
        stargatePolygon.deliverMessage(address(polygonTrader), payload, usdcAmount);
        vm.stopPrank();

        // Verify final state
        assertEq(ctf.balanceOf(userA, yesTokenId), amount, "User did not receive position tokens");
    }

    function test_StargateFees() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        vm.startPrank(userA);

        console.log("Testing fee failure case...");
        vm.expectRevert("Insufficient native token provided");
        optimismTrader.sendBuyOrder(yesTokenId, amount, price, options);

        console.log("Testing successful case with enough ETH...");
        uint256 initialUserUSDC = usdc.balanceOf(userA);
        uint256 usdcAmount = (amount * price) / 1e6;

        optimismTrader.sendBuyOrder{ value: 0.01 ether }(yesTokenId, amount, price, options);

        assertEq(usdc.balanceOf(userA), initialUserUSDC - usdcAmount, "Incorrect USDC deduction");
        vm.stopPrank();
    }

    function test_RevertUnauthorizedSender() public {
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.prank(address(0xBAD));
        vm.expectRevert("Only Stargate");
        polygonTrader.sgReceive(1, "", 0, address(usdc), amount, payload);
    }

    function test_RevertInvalidToken() public {
        address invalidToken = address(0xBAD);
        uint256 amount = 100 * 10 ** 6;
        bytes memory payload = "";

        vm.prank(address(stargatePolygon));
        vm.expectRevert("Only USDC accepted");
        polygonTrader.sgReceive(1, "", 0, invalidToken, amount, payload);
    }

    function test_AuthorizedTraderSetup() public {
        assertTrue(positionManager.authorizedTraders(address(optimismTrader)), "OptimismTrader should be authorized");
        assertTrue(positionManager.authorizedTraders(address(polygonTrader)), "PolygonTrader should be authorized");
    }

    function logBalances() internal view {
        console.log("\n=== Balance and Allowance Report ===");
        console.log("User A USDC Balance:", usdc.balanceOf(userA));
        console.log("Position Manager USDC Balance:", usdc.balanceOf(address(positionManager)));
        console.log("Exchange USDC Balance:", usdc.balanceOf(address(exchange)));
        console.log("Stargate Optimism USDC Balance:", usdc.balanceOf(address(stargateOptimism)));
        console.log("Stargate Polygon USDC Balance:", usdc.balanceOf(address(stargatePolygon)));
        console.log("PolygonTrader USDC Balance:", usdc.balanceOf(address(polygonTrader)));
        console.log("OptimismTrader USDC Balance:", usdc.balanceOf(address(optimismTrader)));

        console.log("\n=== Allowances ===");
        console.log("UserA -> OptimismTrader:", usdc.allowance(userA, address(optimismTrader)));
        console.log(
            "PolygonTrader -> PositionManager:",
            usdc.allowance(address(polygonTrader), address(positionManager))
        );
        console.log(
            "StargatePolygon -> PolygonTrader:",
            usdc.allowance(address(stargatePolygon), address(polygonTrader))
        );

        console.log("\n=== Position Tokens ===");
        console.log("Position Manager YES Token Balance:", ctf.balanceOf(address(positionManager), yesTokenId));
        console.log("User A YES Token Balance:", ctf.balanceOf(userA, yesTokenId));
        console.log("Exchange YES Token Balance:", ctf.balanceOf(address(exchange), yesTokenId));
        console.log("==================\n");
    }
}
