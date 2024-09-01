// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Bet.sol";

contract MockBettorContract {
    IERC20 public usdcToken;

    constructor(address _usdcAddress) {
        usdcToken = IERC20(_usdcAddress);
    }

    function approveBet(address betAddress, uint256 amount) public {
        usdcToken.approve(betAddress, amount);
    }

    function fundBet(address betAddress, uint256 amount) public {
        Bet(betAddress).fundBet(amount);
    }

    // Function to receive USDC refunds
    function receiveRefund() external payable {}
}