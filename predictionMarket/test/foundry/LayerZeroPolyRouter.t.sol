// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import { LayerZeroPolyRouter } from "../../contracts/LayerZeroPolyRouter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MessagingFee, SendParam } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { MessagingReceipt, OFTReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

// Import mocks
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockStargate } from "./mocks/MockStargate.sol";

contract LayerZeroPolyRouterTest is Test {
    LayerZeroPolyRouter public router;
    MockUSDC public usdc;
    MockStargate public stargate;

    address public owner;
    address public user;
    uint32 public constant POLYGON_EID = 40161;

    event OrderSent(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 usdcAmount,
        bool isBuy
    );

    event DestinationEndpointUpdated(uint32 oldDstEid, uint32 newDstEid);
    event StargateApprovalUpdated(uint256 amount);

    function setUp() public {
        owner = address(this);
        user = address(0xB0B);
        vm.deal(user, 100 ether);

        // Deploy mock contracts
        usdc = new MockUSDC();
        stargate = new MockStargate(address(usdc));

        // Deploy router
        router = new LayerZeroPolyRouter(address(stargate), address(usdc), POLYGON_EID, owner);

        // Setup initial balances and approvals
        usdc.mint(user, 10000 * 10 ** 6);
        vm.prank(user);
        usdc.approve(address(router), type(uint256).max);
    }

    function test_InitialSetup() public {
        assertEq(address(router.stargate()), address(stargate), "Incorrect stargate address");
        assertEq(address(router.usdc()), address(usdc), "Incorrect USDC address");
        assertEq(router.dstEid(), POLYGON_EID, "Incorrect destination endpoint ID");
        assertEq(router.owner(), owner, "Incorrect owner");
        assertEq(usdc.allowance(address(router), address(stargate)), type(uint256).max, "Incorrect stargate allowance");
    }

    function test_SendBuyOrder() public {
        uint256 tokenId = 1;
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        uint256 usdcAmount = (amount * price) / 1e6;
        bytes memory expectedComposeMsg = abi.encode(user, tokenId, amount, price, true);
        bytes32 expectedMessageHash = keccak256(expectedComposeMsg);

        uint256 initialUserUSDC = usdc.balanceOf(user);

        vm.expectEmit(true, true, true, true);
        emit OrderSent(expectedMessageHash, user, tokenId, amount, price, usdcAmount, true);

        vm.prank(user);
        router.sendBuyOrder{ value: 0.01 ether }(tokenId, amount, price, options);

        assertEq(usdc.balanceOf(user), initialUserUSDC - usdcAmount, "Incorrect user USDC balance after order");
    }

    function test_RevertInvalidAmount() public {
        uint256 tokenId = 1;
        uint256 amount = 0;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyRouter.InvalidAmount.selector, 0, "USDC amount must be greater than 0")
        );
        router.sendBuyOrder{ value: 0.01 ether }(tokenId, amount, price, options);
    }

    function test_RevertInsufficientNativeFee() public {
        uint256 tokenId = 1;
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyRouter.InsufficientNativeFee.selector, 0.01 ether, 0));
        router.sendBuyOrder(tokenId, amount, price, options);
    }

    function test_RefundExcessNativeFee() public {
        uint256 tokenId = 1;
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        uint256 excessAmount = 1 ether;
        uint256 initialBalance = user.balance;

        vm.prank(user);
        router.sendBuyOrder{ value: excessAmount }(tokenId, amount, price, options);

        assertEq(user.balance, initialBalance - 0.01 ether, "Excess native fee not refunded");
    }

    function test_UpdateDestinationEndpoint() public {
        uint32 newDstEid = 50;

        vm.expectEmit(true, true, true, true);
        emit DestinationEndpointUpdated(POLYGON_EID, newDstEid);

        router.setDestinationEndpoint(newDstEid);
        assertEq(router.dstEid(), newDstEid, "Destination endpoint not updated");
    }

    function test_RevertUnauthorizedEndpointUpdate() public {
        vm.expectRevert();
        vm.prank(user);
        router.setDestinationEndpoint(50);
    }

    function test_UpdateStargateApproval() public {
        vm.expectEmit(true, true, true, true);
        emit StargateApprovalUpdated(type(uint256).max);

        router.updateStargateApproval();
        assertEq(
            usdc.allowance(address(router), address(stargate)),
            type(uint256).max,
            "Stargate approval not updated"
        );
    }

    function test_RevertUnauthorizedApprovalUpdate() public {
        vm.expectRevert();
        vm.prank(user);
        router.updateStargateApproval();
    }

    function test_RevertStargateSendTokenFailed() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;
        bytes memory options = "";

        // Setup test conditions
        vm.startPrank(user);
        usdc.approve(address(router), type(uint256).max);

        // Set stargate to fail mode
        stargate.setFailMode(true);

        // Expect the specific custom error
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyRouter.StargateOperationFailed.selector));

        router.sendBuyOrder{ value: 0.01 ether }(1, amount, price, options);
        vm.stopPrank();
    }
}
