// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { PolymarketPositionManager } from "./PolymarketPositionManager.sol";

contract LayerZeroPolyTrader is Ownable {
    using SafeERC20 for IERC20;

    // Custom errors
    error InvalidAddress(string parameter);
    error UnauthorizedCaller(address caller, address expected);
    error InvalidToken(address token, address expected);
    error CrossChainOperationFailed(string reason);

    // State variables
    PolymarketPositionManager public positionManager;
    IStargate public stargate;
    IERC20 public usdc;

    // Mapping to track processed messages
    mapping(uint32 => mapping(uint64 => bool)) public processedMessages;

    // Events
    event OrderExecuted(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    constructor(
        address _positionManager,
        address _stargate,
        address _usdc,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_positionManager == address(0)) revert InvalidAddress("position manager");
        if (_stargate == address(0)) revert InvalidAddress("stargate");
        if (_usdc == address(0)) revert InvalidAddress("usdc");

        positionManager = PolymarketPositionManager(_positionManager);
        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);

        // Approve PositionManager to spend USDC
        usdc.approve(address(positionManager), type(uint256).max);
    }

    function sgReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        address _token,
        uint256 amountLD,
        bytes memory _payload
    ) external {
        // Validate caller and token
        if (msg.sender != address(stargate)) {
            revert UnauthorizedCaller(msg.sender, address(stargate));
        }

        if (_token != address(usdc)) {
            revert InvalidToken(_token, address(usdc));
        }

        // Prevent duplicate messages
        if (processedMessages[uint32(_srcChainId)][_nonce]) {
            revert CrossChainOperationFailed("Message already processed");
        }

        processedMessages[uint32(_srcChainId)][_nonce] = true;

        (address trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy) = abi.decode(
            _payload,
            (address, uint256, uint256, uint256, bool)
        );

        if (isBuy) {
            bytes32 messageHash = keccak256(_payload);

            try positionManager.buyPosition(tokenId, amount, price) {
                // Transfer position tokens to trader
                positionManager.transferPosition(trader, tokenId, amount);
                emit OrderExecuted(messageHash, trader, tokenId, amount, price, isBuy);
            } catch (bytes memory reason) {
                // If the buy fails, refund the USDC to the trader
                usdc.safeTransfer(trader, amountLD);

                // Extract the selector from the error data
                bytes4 selector;
                assembly {
                    selector := mload(add(reason, 32))
                }

                // Check if it's an InsufficientBalance error
                if (selector == bytes4(keccak256("InsufficientBalance(uint256,uint256)"))) {
                    revert CrossChainOperationFailed("Buy position failed: InsufficientBalance");
                }

                revert CrossChainOperationFailed("Buy position failed with low-level error");
            }
        }
    }

    receive() external payable {}
}
