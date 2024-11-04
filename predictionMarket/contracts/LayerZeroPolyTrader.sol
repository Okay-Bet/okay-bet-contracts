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

    // State variables
    PolymarketPositionManager public positionManager;
    IStargate public stargate;
    IERC20 public usdc;
    uint32 public dstEid;

    // Events
    event OrderSent(
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 usdcAmount,
        bool isBuy
    );

    event OrderExecuted(address indexed trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy);

    constructor(
        address _positionManager,
        address _stargate,
        address _usdc,
        uint32 _dstEid,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_positionManager != address(0), "Invalid position manager");
        require(_stargate != address(0), "Invalid stargate");
        require(_usdc != address(0), "Invalid USDC");

        positionManager = PolymarketPositionManager(_positionManager);
        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);
        dstEid = _dstEid;

        // Approve Stargate to spend USDC
        usdc.forceApprove(address(stargate), type(uint256).max);
    }

    function sendBuyOrder(uint256 tokenId, uint256 amount, uint256 maxPrice, bytes calldata _options) external payable {
        // Calculate USDC amount needed with precision
        uint256 usdcAmount = (amount * maxPrice) / 1e6;
        require(usdcAmount > 0, "Invalid USDC amount");

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Check and refresh approval if needed
        uint256 currentAllowance = usdc.allowance(address(this), address(stargate));
        if (currentAllowance < usdcAmount) {
            usdc.forceApprove(address(stargate), type(uint256).max);
        }

        // Prepare the compose message for destination chain actions
        bytes memory composeMsg = abi.encode(
            msg.sender, // trader address
            tokenId, // position token ID
            amount, // position amount
            maxPrice, // max price per token
            true // isBuy flag
        );

        // Prepare SendParam for Stargate
        SendParam memory sendParam = SendParam({
            dstEid: dstEid,
            to: addressToBytes32(address(this)),
            amountLD: usdcAmount,
            minAmountLD: usdcAmount,
            extraOptions: _options,
            composeMsg: composeMsg,
            oftCmd: ""
        });

        // Get messaging fee quote
        MessagingFee memory messagingFee = stargate.quoteSend(sendParam, false);
        require(msg.value >= messagingFee.nativeFee, "Insufficient native token provided");

        // Send tokens via Stargate
        try stargate.sendToken{ value: messagingFee.nativeFee }(sendParam, messagingFee, msg.sender) {
            emit OrderSent(msg.sender, tokenId, amount, maxPrice, usdcAmount, true);
        } catch {
            // If the send fails, refund the user's USDC
            usdc.safeTransfer(msg.sender, usdcAmount);
            revert("Stargate sendToken failed");
        }

        // Refund excess native token
        if (msg.value > messagingFee.nativeFee) {
            (bool success, ) = msg.sender.call{ value: msg.value - messagingFee.nativeFee }("");
            require(success, "Native token refund failed");
        }
    }

    function sgReceive(
        uint16 /* _srcChainId */,
        bytes memory /* _srcAddress */,
        uint256 /* _nonce */,
        address _token,
        uint256 amountLD,
        bytes memory _payload
    ) external {
        require(msg.sender == address(stargate), "Only Stargate");
        require(_token == address(usdc), "Only USDC accepted");

        // Decode the order details
        (address trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy) = abi.decode(
            _payload,
            (address, uint256, uint256, uint256, bool)
        );

        if (isBuy) {
            // Ensure contract has approved PositionManager
            uint256 currentAllowance = usdc.allowance(address(this), address(positionManager));
            if (currentAllowance < amountLD) {
                usdc.forceApprove(address(positionManager), type(uint256).max);
            }

            // Execute buy order on Polymarket
            try positionManager.buyPosition(tokenId, amount, price) {
                // Transfer position tokens to trader
                positionManager.transferPosition(trader, tokenId, amount);
                emit OrderExecuted(trader, tokenId, amount, price, isBuy);
            } catch Error(string memory reason) {
                // If the buy fails, refund the USDC to the trader
                usdc.safeTransfer(trader, amountLD);
                revert(string(abi.encodePacked("Buy position failed: ", reason)));
            }
        }
    }

    function addressToBytes32(address _addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    // Admin functions
    function setDestinationEndpoint(uint32 _dstEid) external onlyOwner {
        dstEid = _dstEid;
    }

    function updateStargateApproval() external onlyOwner {
        usdc.forceApprove(address(stargate), type(uint256).max);
    }

    // Function to receive ETH when excess is refunded
    receive() external payable {}
}
