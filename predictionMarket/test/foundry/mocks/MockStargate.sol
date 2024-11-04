// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MessagingFee, SendParam, MessagingReceipt, OFTReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

contract MockStargate {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    struct Ticket {
        uint56 ticketId;
        bytes passenger;
    }

    event OFTSent(
        bytes32 indexed guid,
        uint32 dstEid,
        address indexed fromAddress,
        uint256 amountSentLD,
        uint256 amountReceivedLD
    );

    event TokenSent(address indexed sender, uint32 dstEid, bytes32 receiver, uint256 amount, bytes composeMsg);

    constructor(address _token) {
        token = IERC20(_token);
    }

    function quoteSend(SendParam calldata, bool) external pure returns (MessagingFee memory) {
        return MessagingFee(0.01 ether, 0);
    }

    function sendToken(
        SendParam calldata _sendParam,
        MessagingFee calldata _messagingFee,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory, Ticket memory) {
        require(msg.value >= _messagingFee.nativeFee, "Insufficient native token provided");

        token.safeTransferFrom(msg.sender, address(this), _sendParam.amountLD);

        bytes32 guid = bytes32(uint256(1)); // dummy guid for testing

        emit TokenSent(msg.sender, _sendParam.dstEid, _sendParam.to, _sendParam.amountLD, _sendParam.composeMsg);

        emit OFTSent(guid, _sendParam.dstEid, msg.sender, _sendParam.amountLD, _sendParam.amountLD);

        return (
            MessagingReceipt(
                guid, // bytes32 guid
                uint64(1), // uint64 nonce
                _messagingFee // MessagingFee struct
            ),
            OFTReceipt(_sendParam.amountLD, _sendParam.amountLD),
            Ticket(1, new bytes(0))
        );
    }

    function deliverMessage(address targetContract, bytes memory payload, uint256 amount) external {
        token.safeTransfer(targetContract, amount);

        (bool success, ) = targetContract.call(
            abi.encodeWithSelector(
                bytes4(keccak256("sgReceive(uint16,bytes,uint256,address,uint256,bytes)")),
                uint16(1),
                "",
                uint256(0),
                address(token),
                amount,
                payload
            )
        );
        require(success, "Message delivery failed");
    }

    function quoteOFT(
        SendParam calldata _sendParam
    ) external pure returns (OFTLimit memory limit, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory receipt) {
        // Return dummy values for testing
        limit = OFTLimit(_sendParam.minAmountLD, type(uint256).max);
        oftFeeDetails = new OFTFeeDetail[](0);
        receipt = OFTReceipt(_sendParam.amountLD, _sendParam.amountLD);
    }

    receive() external payable {}
}

// Additional struct definitions needed for the mock
struct OFTLimit {
    uint256 minAmountLD;
    uint256 maxAmountLD;
}

struct OFTFeeDetail {
    int256 feeAmountLD;
    string description;
}
