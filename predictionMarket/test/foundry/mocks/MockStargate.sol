// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MessagingFee, SendParam, MessagingReceipt, OFTReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { IStargate, Ticket } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

// Additional struct definitions needed for the mock
struct OFTLimit {
    uint256 minAmountLD;
    uint256 maxAmountLD;
}

struct OFTFeeDetail {
    int256 feeAmountLD;
    string description;
}

contract MockStargate {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bool public failMode;

    event TokenSent(address indexed sender, uint32 dstEid, bytes32 receiver, uint256 amount, bytes composeMsg);

    constructor(address _token) {
        token = IERC20(_token);
    }

    function setFailMode(bool _mode) external {
        failMode = _mode;
    }

    function quoteSend(SendParam calldata, bool) external pure returns (MessagingFee memory) {
        return MessagingFee(0.01 ether, 0);
    }

    function sendToken(
        SendParam calldata _sendParam,
        MessagingFee calldata _messagingFee,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory, Ticket memory) {
        require(!failMode, "Stargate: operation failed");
        require(msg.value >= _messagingFee.nativeFee, "Insufficient native token provided");

        token.safeTransferFrom(msg.sender, address(this), _sendParam.amountLD);

        emit TokenSent(msg.sender, _sendParam.dstEid, _sendParam.to, _sendParam.amountLD, _sendParam.composeMsg);

        return (
            MessagingReceipt(bytes32(uint256(1)), uint64(1), _messagingFee),
            OFTReceipt(_sendParam.amountLD, _sendParam.amountLD),
            Ticket(1, new bytes(0))
        );
    }

    function deliverMessage(address targetContract, bytes memory payload, uint256 amount) external {
        // Capture the original error data before any token transfers
        try token.transfer(targetContract, amount) {
            // Try to execute the sgReceive call
            (bool success, bytes memory result) = targetContract.call(
                abi.encodeWithSelector(
                    bytes4(keccak256("sgReceive(uint16,bytes,uint64,address,uint256,bytes)")),
                    uint16(10), // srcChainId - Optimism
                    "", // srcAddress
                    uint64(1), // nonce
                    address(token),
                    amount,
                    payload
                )
            );

            if (!success) {
                // If the call failed, try to decode the error
                if (result.length > 4) {
                    // We have error data to forward
                    assembly {
                        revert(add(result, 32), mload(result))
                    }
                } else {
                    // No error data, create a generic error
                    revert("Message delivery failed");
                }
            }
        } catch Error(string memory reason) {
            // Forward the token transfer error
            revert(reason);
        } catch (bytes memory err) {
            // Forward any other errors
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }

    function quoteOFT(
        SendParam calldata _sendParam
    ) external pure returns (OFTLimit memory limit, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory receipt) {
        limit = OFTLimit(_sendParam.minAmountLD, type(uint256).max);
        oftFeeDetails = new OFTFeeDetail[](0);
        receipt = OFTReceipt(_sendParam.amountLD, _sendParam.amountLD);
    }

    receive() external payable {}
}
