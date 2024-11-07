// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import { LayerZeroPolyRouter } from "../../contracts/LayerZeroPolyRouter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MessagingFee, SendParam, OFTLimit, OFTReceipt, OFTFeeDetail } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockStargate } from "./mocks/MockStargate.sol";

contract LayerZeroPolyRouterTest is Test {
    using OptionsBuilder for bytes;

    LayerZeroPolyRouter public router;
    MockUSDC public usdc;
    MockStargate public stargate;

    address public owner;
    address public user;
    uint32 public constant POLYGON_EID = 40161;
    uint128 public constant COMPOSE_GAS_LIMIT = 200000;

    // Test constants
    uint256 constant INITIAL_BALANCE = 10000 * 10 ** 6;
    uint256 constant TOKEN_ID = 1;
    uint256 constant AMOUNT = 100 * 10 ** 6;
    uint256 constant PRICE = 0.5 * 10 ** 6;
    uint256 constant NATIVE_FEE = 0.01 ether;

    event OrderSent(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 usdcAmount,
        bool isBuy
    );

    event StargateApprovalUpdated(uint256 amount);
    event DestinationEndpointUpdated(uint32 oldDstEid, uint32 newDstEid);

    function setUp() public {
        owner = address(this);
        user = address(0xB0B);
        vm.deal(user, 100 ether);

        usdc = new MockUSDC();
        stargate = new MockStargate(address(usdc));
        router = new LayerZeroPolyRouter(address(stargate), address(usdc), POLYGON_EID, owner);

        usdc.mint(user, INITIAL_BALANCE);
        vm.prank(user);
        usdc.approve(address(router), type(uint256).max);
    }

    function test_QuoteOrder() public {
        LayerZeroPolyRouter.QuoteData memory quote = router.quoteOrder(TOKEN_ID, AMOUNT, PRICE);

        uint256 expectedUSDCAmount = (AMOUNT * PRICE) / 1e6;
        assertEq(quote.usdcAmount, expectedUSDCAmount, "Incorrect USDC amount calculation");
        assertTrue(quote.nativeFee > 0, "Native fee should be greater than 0");
        assertTrue(quote.minReceived <= expectedUSDCAmount, "Min received should be less than or equal to sent amount");
    }

    function test_QuoteOrder_ZeroAmount() public {
        vm.expectRevert(
            abi.encodeWithSelector(LayerZeroPolyRouter.InvalidAmount.selector, 0, "USDC amount must be greater than 0")
        );
        router.quoteOrder(TOKEN_ID, 0, PRICE);
    }

    function test_SendBuyOrder_Success() public {
        uint256 expectedUSDCAmount = (AMOUNT * PRICE) / 1e6;

        // Create the exact same compose message as in the contract
        bytes memory expectedComposeMsg = abi.encode(
            user, // trader address
            TOKEN_ID, // token ID
            AMOUNT, // amount of tokens
            PRICE, // price per token
            true, // isBuy flag
            expectedUSDCAmount // amountLD
        );

        vm.expectEmit(true, true, false, true);
        emit OrderSent(keccak256(expectedComposeMsg), user, TOKEN_ID, AMOUNT, PRICE, expectedUSDCAmount, true);

        vm.prank(user);
        router.sendBuyOrder{ value: NATIVE_FEE }(TOKEN_ID, AMOUNT, PRICE);

        assertEq(stargate.lastTokenAmount(), expectedUSDCAmount, "Incorrect USDC amount sent to Stargate");
        assertEq(stargate.lastDestinationEid(), POLYGON_EID, "Incorrect destination chain");
    }

    function test_SendBuyOrder_InsufficientNativeFee() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(LayerZeroPolyRouter.InsufficientNativeFee.selector, NATIVE_FEE, 0));
        router.sendBuyOrder(TOKEN_ID, AMOUNT, PRICE);
    }

    function test_SendBuyOrder_AmountOutsideLimits() public {
        // Set mock limits in Stargate
        stargate.setMockLimits(1000 * 10 ** 6, 2000 * 10 ** 6);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                LayerZeroPolyRouter.AmountOutsideLimits.selector,
                (AMOUNT * PRICE) / 1e6,
                1000 * 10 ** 6,
                2000 * 10 ** 6
            )
        );
        router.sendBuyOrder{ value: NATIVE_FEE }(TOKEN_ID, AMOUNT, PRICE);
    }

    function test_SendBuyOrder_RefundExcessNativeFee() public {
        uint256 excessFee = 0.02 ether;
        uint256 initialBalance = user.balance;

        vm.prank(user);
        router.sendBuyOrder{ value: NATIVE_FEE + excessFee }(TOKEN_ID, AMOUNT, PRICE);

        assertEq(user.balance, initialBalance - NATIVE_FEE, "Excess native fee not refunded");
    }

    function test_SendBuyOrder_StargateFailure() public {
        stargate.setFailMode(true);
        uint256 initialUSDCBalance = usdc.balanceOf(user);

        vm.prank(user);
        vm.expectRevert(LayerZeroPolyRouter.StargateOperationFailed.selector);
        router.sendBuyOrder{ value: NATIVE_FEE }(TOKEN_ID, AMOUNT, PRICE);

        assertEq(usdc.balanceOf(user), initialUSDCBalance, "USDC not refunded after Stargate failure");
    }

    function test_SendBuyOrder_DynamicApproval() public {
        // Reset approval to 0
        vm.startPrank(address(router));
        usdc.approve(address(stargate), 0);
        vm.stopPrank();

        vm.prank(user);
        router.sendBuyOrder{ value: NATIVE_FEE }(TOKEN_ID, AMOUNT, PRICE);
    }

    function test_SetDestinationEndpoint() public {
        uint32 newDstEid = 30111;

        vm.expectEmit(true, true, false, true);
        emit DestinationEndpointUpdated(POLYGON_EID, newDstEid);

        router.setDestinationEndpoint(newDstEid);
        assertEq(router.dstEid(), newDstEid, "Destination endpoint not updated");
    }

    function test_SetDestinationEndpoint_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        router.setDestinationEndpoint(30111);
    }
}
