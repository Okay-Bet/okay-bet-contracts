// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { MessagingFee, SendParam, OFTLimit, OFTReceipt, OFTFeeDetail } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract LayerZeroPolyRouter is Ownable {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;

    // Custom errors
    error InvalidAmount(uint256 amount, string reason);
    error InsufficientNativeFee(uint256 required, uint256 provided);
    error StargateOperationFailed();
    error InvalidAddress(string parameter);
    error RefundFailed();
    error AmountOutsideLimits(uint256 amount, uint256 minAllowed, uint256 maxAllowed);

    // State variables
    IStargate public immutable stargate;
    IERC20 public immutable usdc;
    uint32 public dstEid;

    // Events
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

    // Structs
    struct QuoteData {
        uint256 usdcAmount;
        uint256 minReceived;
        uint256 nativeFee;
        uint256 minAllowed;
        uint256 maxAllowed;
    }

    uint128 private constant COMPOSE_GAS_LIMIT = 200000;

    constructor(address _stargate, address _usdc, uint32 _dstEid, address initialOwner) Ownable(initialOwner) {
        if (_stargate == address(0)) revert InvalidAddress("stargate");
        if (_usdc == address(0)) revert InvalidAddress("usdc");

        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);
        dstEid = _dstEid;
    }

    function quoteOrder(uint256 tokenId, uint256 amount, uint256 price) external view returns (QuoteData memory) {
        uint256 usdcAmount = (amount * price) / 1e6;
        if (usdcAmount == 0) revert InvalidAmount(usdcAmount, "USDC amount must be greater than 0");

        bytes memory composeMsg = abi.encode(msg.sender, tokenId, amount, price, true);

        bytes memory extraOptions = OptionsBuilder.newOptions().addExecutorLzComposeOption(0, COMPOSE_GAS_LIMIT, 0);

        SendParam memory sendParam = SendParam({
            dstEid: dstEid,
            to: addressToBytes32(msg.sender),
            amountLD: usdcAmount,
            minAmountLD: usdcAmount,
            extraOptions: extraOptions,
            composeMsg: composeMsg,
            oftCmd: ""
        });

        (OFTLimit memory limit, , OFTReceipt memory receipt) = stargate.quoteOFT(sendParam);
        MessagingFee memory messagingFee = stargate.quoteSend(sendParam, false);

        return
            QuoteData({
                usdcAmount: usdcAmount,
                minReceived: receipt.amountReceivedLD,
                nativeFee: messagingFee.nativeFee,
                minAllowed: limit.minAmountLD,
                maxAllowed: limit.maxAmountLD
            });
    }

    function sendBuyOrder(uint256 tokenId, uint256 amount, uint256 price) external payable {
        uint256 usdcAmount = (amount * price) / 1e6;
        if (usdcAmount == 0) revert InvalidAmount(usdcAmount, "USDC amount must be greater than 0");

        // Transfer USDC from user to this contract
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Create compose message with order details
        bytes memory composeMsg = abi.encode(
            msg.sender, // trader address
            tokenId, // token ID to buy
            amount, // amount of tokens
            price, // price per token
            true, // isBuy flag
            usdcAmount // Added amountLD for refund purposes
        );

        // Create extra options with compose gas
        bytes memory extraOptions = OptionsBuilder.newOptions().addExecutorLzComposeOption(0, COMPOSE_GAS_LIMIT, 0);

        // Prepare SendParam for Stargate
        SendParam memory sendParam = SendParam({
            dstEid: dstEid,
            to: addressToBytes32(msg.sender), // Send to the original sender
            amountLD: usdcAmount,
            minAmountLD: usdcAmount, // Will be updated after quoteOFT
            extraOptions: extraOptions,
            composeMsg: composeMsg,
            oftCmd: "" // Empty string for taxi mode
        });

        // Check limits and get quotes
        (OFTLimit memory limit, , OFTReceipt memory receipt) = stargate.quoteOFT(sendParam);

        // Verify amount is within limits
        if (usdcAmount < limit.minAmountLD || usdcAmount > limit.maxAmountLD) {
            revert AmountOutsideLimits(usdcAmount, limit.minAmountLD, limit.maxAmountLD);
        }

        // Update minAmountLD based on quote
        sendParam.minAmountLD = receipt.amountReceivedLD;

        // Ensure sufficient Stargate approval
        if (usdc.allowance(address(this), address(stargate)) < usdcAmount) {
            usdc.safeIncreaseAllowance(address(stargate), type(uint256).max);
            emit StargateApprovalUpdated(type(uint256).max);
        }

        // Get messaging fee
        MessagingFee memory messagingFee = stargate.quoteSend(sendParam, false);
        if (msg.value < messagingFee.nativeFee) {
            revert InsufficientNativeFee({ required: messagingFee.nativeFee, provided: msg.value });
        }

        // Generate message hash for event
        bytes32 messageHash = keccak256(composeMsg);

        // Send tokens through Stargate
        try stargate.sendToken{ value: messagingFee.nativeFee }(sendParam, messagingFee, msg.sender) {
            emit OrderSent(messageHash, msg.sender, tokenId, amount, price, usdcAmount, true);
        } catch {
            // If the buy fails, refund USDC to user
            usdc.safeTransfer(msg.sender, usdcAmount);
            revert StargateOperationFailed();
        }

        // Refund excess native token if any
        uint256 refundAmount = msg.value - messagingFee.nativeFee;
        if (refundAmount > 0) {
            (bool success, ) = msg.sender.call{ value: refundAmount }("");
            if (!success) revert RefundFailed();
        }
    }

    function addressToBytes32(address _addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    function setDestinationEndpoint(uint32 _dstEid) external onlyOwner {
        uint32 oldDstEid = dstEid;
        dstEid = _dstEid;
        emit DestinationEndpointUpdated(oldDstEid, _dstEid);
    }

    receive() external payable {}
}
