// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";
import { PolymarketPositionManager } from "./PolymarketPositionManager.sol";

interface ILayerZeroReceiver {
    function lzCompose(
        address _from,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable;
}

contract LayerZeroPolyTrader is Ownable, ILayerZeroReceiver {
    using SafeERC20 for IERC20;

    // Custom errors
    error InvalidAddress(string parameter);
    error UnauthorizedCaller(address caller, address expected);
    error InvalidToken(address token, address expected);
    error CrossChainOperationFailed(string reason);
    error InsufficientBalance(uint256 required, uint256 available);
    error ApprovalFailed(address token, address spender);

    // State variables
    PolymarketPositionManager public immutable positionManager;
    IStargate public immutable stargate;
    IERC20 public immutable usdc;
    address public immutable endpoint;

    // Events
    event OrderExecuted(
        bytes32 indexed messageHash,
        address indexed trader,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    event RefundIssued(address indexed trader, uint256 amount, string reason);

    event ApprovalUpdated(address indexed token, address indexed spender, uint256 amount);

    constructor(
        address _positionManager,
        address _stargate,
        address _usdc,
        address _endpoint,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_positionManager == address(0)) revert InvalidAddress("position manager");
        if (_stargate == address(0)) revert InvalidAddress("stargate");
        if (_usdc == address(0)) revert InvalidAddress("usdc");
        if (_endpoint == address(0)) revert InvalidAddress("endpoint");

        positionManager = PolymarketPositionManager(_positionManager);
        stargate = IStargate(_stargate);
        usdc = IERC20(_usdc);
        endpoint = _endpoint;

        // Initial approval setup
        _updateApproval(address(positionManager));
    }

    function _updateApproval(address spender) internal {
        // First reset allowance to 0
        uint256 currentAllowance = usdc.allowance(address(this), spender);
        if (currentAllowance > 0) {
            usdc.safeDecreaseAllowance(spender, currentAllowance);
        }

        // Then set to max
        usdc.safeIncreaseAllowance(spender, type(uint256).max);
        emit ApprovalUpdated(address(usdc), spender, type(uint256).max);
    }

    function updatePositionManagerApproval() external onlyOwner {
        _updateApproval(address(positionManager));
    }

    function lzCompose(
        address _from,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable {
        // Verify caller
        if (msg.sender != endpoint) revert UnauthorizedCaller(msg.sender, endpoint);
        if (_from != address(stargate)) revert UnauthorizedCaller(_from, address(stargate));

        // Decode the message
        (address trader, uint256 tokenId, uint256 amount, uint256 price, bool isBuy, uint256 amountLD) = abi.decode(
            _message,
            (address, uint256, uint256, uint256, bool, uint256)
        );

        // Verify USDC balance
        uint256 balance = usdc.balanceOf(address(this));
        if (balance < amountLD) {
            revert InsufficientBalance(amountLD, balance);
        }

        // Check and update approval if necessary
        uint256 currentAllowance = usdc.allowance(address(this), address(positionManager));
        if (currentAllowance < amountLD) {
            _updateApproval(address(positionManager));
        }

        if (isBuy) {
            bytes32 messageHash = keccak256(_message);
            bool success = true;

            try positionManager.buyPosition(tokenId, amount, price) {
                try positionManager.transferPosition(trader, tokenId, amount) {
                    emit OrderExecuted(messageHash, trader, tokenId, amount, price, true);
                } catch {
                    success = false;
                }
            } catch {
                success = false;
            }

            // Handle failure by doing refund
            if (!success) {
                // First do the refund
                usdc.transfer(trader, amountLD);
                emit RefundIssued(trader, amountLD, "Buy position failed");
                // Then emit failure
                emit OrderExecuted(messageHash, trader, tokenId, amount, price, false);
            }

            // Return successfully without reverting
            return;
        }
    }

    receive() external payable {}
}
