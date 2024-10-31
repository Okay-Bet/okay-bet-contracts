// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IExchange } from "../../../contracts/interfaces/IExchange.sol";


contract MockExchange is IExchange, IERC1155Receiver {
    IERC20 public immutable usdc;
    IERC1155 public immutable ctf;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 makerAssetId,
        uint256 takerAssetId,
        uint256 makerAmountFilled,
        uint256 takerAmountFilled,
        uint256 fee
    );

    constructor(address _usdc, address _ctf) {
        usdc = IERC20(_usdc);
        ctf = IERC1155(_ctf);
    }

    function fillOrder(Order calldata order) external override {
        // Simulate exchange behavior
        if (order.side == 0) {
            // Buy
            // Transfer USDC from maker to this contract
            require(usdc.transferFrom(order.maker, address(this), order.makerAmount), "USDC transfer failed");
            // Transfer position tokens from this contract to maker
            ctf.safeTransferFrom(address(this), order.maker, order.tokenId, order.takerAmount, "");
        } else {
            // Sell
            // Transfer position tokens from maker to this contract
            ctf.safeTransferFrom(order.maker, address(this), order.tokenId, order.makerAmount, "");
            // Transfer USDC from this contract to maker
            require(usdc.transfer(order.maker, order.takerAmount), "USDC transfer failed");
        }

        emit OrderFilled(
            keccak256(abi.encode(order)),
            order.maker,
            order.taker,
            order.side == 0 ? 0 : order.tokenId, // makerAssetId
            order.side == 0 ? order.tokenId : 0, // takerAssetId
            order.makerAmount,
            order.takerAmount,
            order.feeRateBps
        );
    }

    // ERC1155Receiver Implementation
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
