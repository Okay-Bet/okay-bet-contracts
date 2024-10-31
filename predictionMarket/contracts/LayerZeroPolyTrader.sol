// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OApp, MessagingFee, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import { PolymarketPositionManager } from "./PolymarketPositionManager.sol";

contract LayerZeroPolyTrader is OApp {
    // State variables
    PolymarketPositionManager public positionManager;
    IERC20 public usdc;

    // Events
    event OrderSent(address indexed trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy);
    event OrderExecuted(address indexed trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy);

    constructor(
        address _endpoint,
        address _delegate,
        address _positionManager,
        address _usdc
    ) OApp(_endpoint, _delegate) Ownable(_delegate) {
        positionManager = PolymarketPositionManager(_positionManager);
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Sends a buy order from Optimism to Polygon
     * @param _dstEid The endpoint ID of Polygon
     * @param tokenId The token ID to buy
     * @param amount The amount of tokens to buy
     * @param maxPrice The maximum price willing to pay
     * @param _options Additional options for message execution
     */
    function sendBuyOrder(
        uint32 _dstEid,
        uint256 tokenId,
        uint256 amount,
        uint256 maxPrice,
        bytes calldata _options
    ) external payable returns (MessagingReceipt memory receipt) {
        // Calculate USDC amount needed
        uint256 usdcAmount = (amount * maxPrice) / 1e6;

        // Transfer USDC from user
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        // Prepare the payload
        bytes memory payload = abi.encode(
            msg.sender, // trader
            tokenId,
            amount,
            maxPrice,
            true // isBuy
        );

        // Send the message
        receipt = _lzSend(_dstEid, payload, _options, MessagingFee(msg.value, 0), payable(msg.sender));

        emit OrderSent(msg.sender, tokenId, amount, maxPrice, true);
    }

    /**
     * @notice Sends a sell order from Optimism to Polygon
     */
    function sendSellOrder(
        uint32 _dstEid,
        uint256 tokenId,
        uint256 amount,
        uint256 minPrice,
        bytes calldata _options
    ) external payable returns (MessagingReceipt memory receipt) {
        bytes memory payload = abi.encode(
            msg.sender, // trader
            tokenId,
            amount,
            minPrice,
            false // isBuy
        );

        receipt = _lzSend(_dstEid, payload, _options, MessagingFee(msg.value, 0), payable(msg.sender));

        emit OrderSent(msg.sender, tokenId, amount, minPrice, false);
    }

    /**
     * @notice Quotes the gas needed for cross-chain order
     */
    function quote(
        uint32 _dstEid,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy,
        bytes memory _options,
        bool _payInLzToken
    ) public view returns (MessagingFee memory fee) {
        bytes memory payload = abi.encode(
            address(0), // placeholder trader address
            tokenId,
            amount,
            price,
            isBuy
        );

        fee = _quote(_dstEid, payload, _options, _payInLzToken);
    }

    /**
     * @dev Handles incoming messages from Optimism
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 /*_guid*/,
        bytes calldata payload,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        (address trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy) = abi.decode(
            payload,
            (address, uint256, uint256, uint256, bool)
        );

        if (isBuy) {
            positionManager.buyPosition(tokenId, amount, price);
        } else {
            positionManager.sellPosition(tokenId, amount, price);
        }

        emit OrderExecuted(trader, tokenId, amount, price, isBuy);
    }
}
