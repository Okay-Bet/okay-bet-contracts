// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Bet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BetFactory {
    Bet[] public bets;

    // Calculate MIN_EXPIRATION_BLOCKS based on 2-second block times
    // 1 week = 7 days * 24 hours * 60 minutes * 60 seconds = 604,800 seconds
    // 604,800 seconds / 2 seconds per block = 302,400 blocks
    uint256 public constant MIN_EXPIRATION_BLOCKS = 302400; // Approximately 1 week on Base
    
    event BetCreated(address betAddress, address indexed maker, address indexed taker, address indexed judge, uint256 totalWager, uint8 wagerRatio, string conditions, uint256 expirationBlock, address wagerCurrency);

    function createBet(
        address _maker,
        address _taker,
        address _judge,
        uint256 _totalWager,
        uint8 _wagerRatio,
        string memory _conditions,
        uint256 _expirationBlocks,
        address _wagerCurrency
    ) public {
        require(_maker != _taker, "Maker and taker must be different addresses");
        require(_maker != address(0) && _taker != address(0) && _judge != address(0), "Invalid address");
        require(_totalWager > 0, "Total wager must be greater than 0");
        require(_wagerRatio >= 0 && _wagerRatio <= 100, "Wager ratio must be between 0 and 100");
        require(_expirationBlocks >= MIN_EXPIRATION_BLOCKS, "Expiration period too short");

        Bet newBet = new Bet(_maker, _taker, _judge, _totalWager, _wagerRatio, _conditions, _wagerCurrency, _expirationBlocks);
        bets.push(newBet);

        emit BetCreated(address(newBet), _maker, _taker, _judge, _totalWager, _wagerRatio, _conditions, block.number + _expirationBlocks, _wagerCurrency);
    }

    function getBets() public view returns (Bet[] memory) {
        return bets;
    }
}