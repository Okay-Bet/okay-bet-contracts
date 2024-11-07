// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IOFT, SendParam, MessagingFee, MessagingReceipt, OFTReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { IStargate, StargateType, Ticket } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OFTLimit, OFTFeeDetail } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

contract MockStargate is IStargate {
    IERC20 private immutable _token; // Renamed from 'token' to '_token'
    bool public failMode;
    bytes public lastComposeMsg;
    uint256 public lastGasLimit;
    uint256 public lastTokenAmount;
    uint32 public lastDestinationEid;
    bytes public expectedMessage;
    bool public lastMessageValid;
    uint256 public mockMinLimit = 0;
    uint256 public mockMaxLimit = type(uint256).max;

    constructor(address tokenAddress) {
        _token = IERC20(tokenAddress);
    }

    function token() external view returns (address) {
        return address(_token);
    }

    function setFailMode(bool _fail) external {
        failMode = _fail;
    }

    function setMessageValidator(bytes memory _expected) external {
        expectedMessage = _expected;
    }

    function setMockLimits(uint256 _min, uint256 _max) external {
        mockMinLimit = _min;
        mockMaxLimit = _max;
    }

    function quoteOFT(
        SendParam calldata _sendParam
    ) external view returns (OFTLimit memory limit, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory receipt) {
        limit = OFTLimit({ minAmountLD: mockMinLimit, maxAmountLD: mockMaxLimit });

        oftFeeDetails = new OFTFeeDetail[](1);
        oftFeeDetails[0] = OFTFeeDetail({ feeAmountLD: 0, description: "mock fee" });

        receipt = OFTReceipt({ amountSentLD: _sendParam.amountLD, amountReceivedLD: _sendParam.amountLD });
    }

    function quoteSend(SendParam calldata, bool) external pure returns (MessagingFee memory) {
        return MessagingFee({ nativeFee: 0.01 ether, lzTokenFee: 0 });
    }

    function sendToken(
        SendParam calldata _sendParam,
        MessagingFee calldata,
        address
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory, Ticket memory) {
        require(!failMode, "Mock: Stargate operation failed");

        lastComposeMsg = _sendParam.composeMsg;
        lastDestinationEid = _sendParam.dstEid;
        lastTokenAmount = _sendParam.amountLD;
        lastMessageValid = keccak256(lastComposeMsg) == keccak256(expectedMessage);

        _token.transferFrom(msg.sender, address(this), _sendParam.amountLD);

        return (
            MessagingReceipt({
                guid: bytes32(0),
                nonce: 0,
                fee: MessagingFee({ nativeFee: 0.01 ether, lzTokenFee: 0 })
            }),
            OFTReceipt({ amountSentLD: _sendParam.amountLD, amountReceivedLD: _sendParam.amountLD }),
            Ticket({ ticketId: 0, passengerBytes: new bytes(0) })
        );
    }

    function stargateType() external pure returns (StargateType) {
        return StargateType.Pool;
    }

    function oftVersion() external pure returns (bytes4 interfaceId, uint64 version) {
        return (0x02e49c2c, 1);
    }

    function approvalRequired() external pure returns (bool) {
        return true;
    }

    function sharedDecimals() external pure returns (uint8) {
        return 6; // For USDC
    }

    function send(
        SendParam calldata,
        MessagingFee calldata,
        address
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory) {
        revert("Not implemented");
    }

    function failEvenWhenFailing()
        external
        payable
        returns (MessagingReceipt memory, OFTReceipt memory, Ticket memory)
    {
        // Always execute the transfer even in fail mode
        lastComposeMsg = "";
        lastDestinationEid = 0;
        lastTokenAmount = 0;
        lastMessageValid = false;
        return (
            MessagingReceipt({
                guid: bytes32(0),
                nonce: 0,
                fee: MessagingFee({ nativeFee: 0.01 ether, lzTokenFee: 0 })
            }),
            OFTReceipt({ amountSentLD: 0, amountReceivedLD: 0 }),
            Ticket({ ticketId: 0, passengerBytes: new bytes(0) })
        );
    }
}
