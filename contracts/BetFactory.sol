// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./Bet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BetFactory {
    uint256 public constant MIN_EXPIRATION_BLOCKS = 302400; // Approximately 1 week on Base

    event BetCreated(address indexed betAddress, address indexed maker, address indexed taker, address judge, uint256 totalWager, uint256 wagerRatio, string conditions, uint256 expirationBlock, address wagerCurrency);

    function createBet(
        address _maker,
        address _taker,
        address _judge,
        uint256 _totalWager,
        uint256 _wagerRatio,
        string memory _conditions,
        uint256 _expirationBlocks,
        address _wagerCurrency
    ) public {
        require(_maker != _taker && _maker != address(0) && _taker != address(0) && _judge != address(0), "Invalid addresses");
        require(_totalWager > 0 && _wagerRatio <= 10000 && _expirationBlocks >= MIN_EXPIRATION_BLOCKS, "Invalid parameters");

        Bet newBet = new Bet(_maker, _taker, _judge, _totalWager, _wagerRatio, _conditions, _wagerCurrency, _expirationBlocks);
        
        emit BetCreated(address(newBet), _maker, _taker, _judge, _totalWager, _wagerRatio, _conditions, block.number + _expirationBlocks, _wagerCurrency);
    }
}