// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { MessagingFee, SendParam } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

contract LayerZeroPolyRouter is Ownable {
    using SafeERC20 for IERC20;

    // Custom errors
    error InvalidAddress(string parameter);
    error InvalidAmount(uint256 amount, string reason);
    error InsufficientNativeFee(uint256 required, uint256 provided);
    error RefundFailed();
    error StargateOperationFailed();

    // State variables
    IStargate public stargate;
    IERC20 public usdc;
    uint32 public dstEid; // Polygon endpoint ID

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

    constructor(address _stargate, address _usdc, uint32 _dstEid, address initialOwner) Ownable(initialOwner) {
        if (_stargate == address(0)) revert InvalidAddress("stargate");
        if (_usdc == address(0)) revert InvalidAddress("usdc");

        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);
        dstEid = _dstEid;

        // Approve Stargate to spend USDC
        usdc.approve(address(stargate), type(uint256).max);
        emit StargateApprovalUpdated(type(uint256).max);
    }

    function sendBuyOrder(uint256 tokenId, uint256 amount, uint256 maxPrice, bytes calldata _options) external payable {
        uint256 usdcAmount = (amount * maxPrice) / 1e6;
        if (usdcAmount == 0) revert InvalidAmount(usdcAmount, "USDC amount must be greater than 0");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 currentAllowance = usdc.allowance(address(this), address(stargate));
        if (currentAllowance < usdcAmount) {
            usdc.approve(address(stargate), 0);
            usdc.approve(address(stargate), type(uint256).max);
            emit StargateApprovalUpdated(type(uint256).max);
        }

        bytes memory composeMsg = abi.encode(msg.sender, tokenId, amount, maxPrice, true);

        SendParam memory sendParam = SendParam({
            dstEid: dstEid,
            to: addressToBytes32(address(this)),
            amountLD: usdcAmount,
            minAmountLD: usdcAmount,
            extraOptions: _options,
            composeMsg: composeMsg,
            oftCmd: ""
        });

        MessagingFee memory messagingFee = stargate.quoteSend(sendParam, false);
        if (msg.value < messagingFee.nativeFee) {
            revert InsufficientNativeFee({ required: messagingFee.nativeFee, provided: msg.value });
        }

        bytes32 messageHash = keccak256(composeMsg);

        try stargate.sendToken{ value: messagingFee.nativeFee }(sendParam, messagingFee, msg.sender) {
            emit OrderSent(messageHash, msg.sender, tokenId, amount, maxPrice, usdcAmount, true);
        } catch {
            usdc.safeTransfer(msg.sender, usdcAmount);
            revert StargateOperationFailed();
        }

        uint256 refundAmount = msg.value - messagingFee.nativeFee;
        if (refundAmount > 0) {
            (bool success, ) = msg.sender.call{ value: refundAmount }("");
            if (!success) revert RefundFailed();
        }
    }

    function addressToBytes32(address _addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    // Admin functions
    function setDestinationEndpoint(uint32 _dstEid) external onlyOwner {
        uint32 oldDstEid = dstEid;
        dstEid = _dstEid;
        emit DestinationEndpointUpdated(oldDstEid, _dstEid);
    }

    function updateStargateApproval() external onlyOwner {
        usdc.approve(address(stargate), 0);
        usdc.approve(address(stargate), type(uint256).max);
        emit StargateApprovalUpdated(type(uint256).max);
    }

    receive() external payable {}
}
