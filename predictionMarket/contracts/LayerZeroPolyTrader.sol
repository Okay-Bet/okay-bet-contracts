// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStargate, Ticket } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { MessagingFee, SendParam } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { PolymarketPositionManager } from "./PolymarketPositionManager.sol";

contract LayerZeroPolyTrader is Ownable {
    using SafeERC20 for IERC20;

    // Custom errors
    error InvalidAddress(string parameter);
    error InvalidAmount(uint256 amount, string reason);
    error InsufficientNativeFee(uint256 required, uint256 provided);
    error CrossChainOperationFailed(string reason);
    error UnauthorizedCaller(address caller, address expected);
    error InvalidToken(address token, address expected);
    error RefundFailed();

    // State variables
    PolymarketPositionManager public positionManager;
    IStargate public stargate;
    IERC20 public usdc;
    uint32 public dstEid;

    // Mapping to track processed messages
    mapping(uint32 => mapping(uint64 => bool)) public processedMessages;

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

    event OrderExecuted(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    event DestinationEndpointUpdated(uint32 oldDstEid, uint32 newDstEid);
    event StargateApprovalUpdated(uint256 amount);

    constructor(
        address _positionManager,
        address _stargate,
        address _usdc,
        uint32 _dstEid,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_positionManager == address(0)) revert InvalidAddress("position manager");
        if (_stargate == address(0)) revert InvalidAddress("stargate");
        if (_usdc == address(0)) revert InvalidAddress("usdc");

        positionManager = PolymarketPositionManager(_positionManager);
        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);
        dstEid = _dstEid;

        // Approve Stargate to spend USDC
        usdc.forceApprove(address(stargate), type(uint256).max);
        emit StargateApprovalUpdated(type(uint256).max);
    }

    function sendBuyOrder(uint256 tokenId, uint256 amount, uint256 maxPrice, bytes calldata _options) external payable {
        uint256 usdcAmount = (amount * maxPrice) / 1e6;
        if (usdcAmount == 0) revert InvalidAmount(usdcAmount, "USDC amount must be greater than 0");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 currentAllowance = usdc.allowance(address(this), address(stargate));
        if (currentAllowance < usdcAmount) {
            usdc.forceApprove(address(stargate), type(uint256).max);
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
            revert CrossChainOperationFailed("Stargate sendToken failed");
        }

        uint256 refundAmount = msg.value - messagingFee.nativeFee;
        if (refundAmount > 0) {
            (bool success, ) = msg.sender.call{ value: refundAmount }("");
            if (!success) revert RefundFailed();
        }
    }

    function sgReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint256 _nonce,
        address _token,
        uint256 amountLD,
        bytes memory _payload
    ) external {
        // Removed nonReentrant modifier
        // Validate caller and token
        if (msg.sender != address(stargate)) {
            revert UnauthorizedCaller(msg.sender, address(stargate));
        }
        if (_token != address(usdc)) {
            revert InvalidToken(_token, address(usdc));
        }

        // Prevent duplicate messages
        if (processedMessages[uint32(_srcChainId)][uint64(_nonce)]) {
            revert CrossChainOperationFailed("Message already processed");
        }
        processedMessages[uint32(_srcChainId)][uint64(_nonce)] = true;

        // Rest of the function remains the same...
        (address trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy) = abi.decode(
            _payload,
            (address, uint256, uint256, uint256, bool)
        );

        if (isBuy) {
            // Ensure contract has approved PositionManager
            uint256 currentAllowance = usdc.allowance(address(this), address(positionManager));
            if (currentAllowance < amountLD) {
                usdc.forceApprove(address(positionManager), type(uint256).max);
                emit StargateApprovalUpdated(type(uint256).max);
            }

            bytes32 messageHash = keccak256(_payload);

            // Execute buy order on Polymarket
            try positionManager.buyPosition(tokenId, amount, price) {
                // Transfer position tokens to trader
                positionManager.transferPosition(trader, tokenId, amount);
                emit OrderExecuted(messageHash, trader, tokenId, amount, price, isBuy);
            } catch Error(string memory reason) {
                // If the buy fails, refund the USDC to the trader
                usdc.safeTransfer(trader, amountLD);
                revert CrossChainOperationFailed(string(abi.encodePacked("Buy position failed: ", reason)));
            }
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
        usdc.forceApprove(address(stargate), type(uint256).max);
        emit StargateApprovalUpdated(type(uint256).max);
    }

    // Function to receive ETH when excess is refunded
    receive() external payable {}
}
