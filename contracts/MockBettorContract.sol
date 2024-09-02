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
        Bet(payable(betAddress)).fundBet(amount);
    }

    // Function to receive USDC refunds
    receive() external payable {}

    // Function to fund bet with ETH
    function fundBetWithEth(address betAddress, uint256 amount) public payable {
        require(msg.value == amount, "Sent ETH must match the funding amount");
        Bet(payable(betAddress)).fundBet{value: amount}(amount);
    }

    // Function to withdraw any ETH balance
    function withdrawEth() public {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance to withdraw");
        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "ETH withdrawal failed");
    }
}