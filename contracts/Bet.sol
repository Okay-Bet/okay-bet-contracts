// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Bet {
    enum BetStatus { Unfunded, PartiallyFunded, FullyFunded, Resolved, Invalidated, Expired }
    
    struct BetDetails {
        address maker;
        address taker;
        address judge;
        uint256 totalWager;
        uint8 wagerRatio; // 0-100, represents maker's share. 50 means equal split.
        string conditions;
        BetStatus status;
        address winner;
        uint256 expirationBlock;
    }
    
    BetDetails public bet;
    IERC20 public usdcToken;
    mapping(address => uint256) public fundedAmount;

    event BetCreated(address indexed maker, address indexed taker, address indexed judge, uint256 totalWager, uint8 wagerRatio, string conditions, uint256 expirationBlock);
    event BetFunded(address indexed funder, uint256 amount);
    event BetFullyFunded();
    event BetResolved(address indexed winner, uint256 amount);
    event BetInvalidated();
    event BetCancelled(address indexed canceller);
    event BetExpired();
    event PayoutFailed(address indexed recipient, uint256 amount);

    constructor(
        address _maker,
        address _taker,
        address _judge,
        uint256 _totalWager,
        uint8 _wagerRatio,
        string memory _conditions,
        address _usdcAddress,
        uint256 _expirationBlocks
    ) {
        require(_maker != _taker, "Maker and taker must be different addresses");
        require(_maker != address(0) && _taker != address(0) && _judge != address(0), "Invalid address");
        require(_totalWager > 0, "Total wager must be greater than 0");
        require(_wagerRatio >= 0 && _wagerRatio <= 100, "Wager ratio must be between 0 and 100");
        
        bet.maker = _maker;
        bet.taker = _taker;
        bet.judge = _judge;
        bet.totalWager = _totalWager;
        bet.wagerRatio = _wagerRatio;
        bet.conditions = _conditions;
        bet.status = BetStatus.Unfunded;
        bet.expirationBlock = block.number + _expirationBlocks;
        usdcToken = IERC20(_usdcAddress);
        
        emit BetCreated(_maker, _taker, _judge, _totalWager, _wagerRatio, _conditions, bet.expirationBlock);
    }

    function getWagerAmount(address bettor) public view returns (uint256) {
        if (bettor == bet.maker) {
            return (bet.totalWager * bet.wagerRatio) / 100;
        } else if (bettor == bet.taker) {
            return (bet.totalWager * (100 - bet.wagerRatio)) / 100;
        }
        return 0;
    }

    function fundBet(uint256 amount) public {
        require(msg.sender == bet.maker || msg.sender == bet.taker, "Only the maker or taker can fund the bet.");
        require(bet.status == BetStatus.Unfunded || bet.status == BetStatus.PartiallyFunded, "Bet is not in a fundable state.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        uint256 expectedAmount = getWagerAmount(msg.sender);
        require(amount + fundedAmount[msg.sender] <= expectedAmount, "Overfunding not allowed.");

        require(usdcToken.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        fundedAmount[msg.sender] += amount;
        
        emit BetFunded(msg.sender, amount);

        if (fundedAmount[bet.maker] == getWagerAmount(bet.maker) && 
            fundedAmount[bet.taker] == getWagerAmount(bet.taker)) {
            bet.status = BetStatus.FullyFunded;
            emit BetFullyFunded();
        } else if (bet.status == BetStatus.Unfunded) {
            bet.status = BetStatus.PartiallyFunded;
        }
    }

    function resolveBet(address _winner) public {
        require(msg.sender == bet.judge, "Only the judge can resolve the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(_winner == bet.maker || _winner == bet.taker, "Invalid winner address.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        bet.winner = _winner;
        bet.status = BetStatus.Resolved;
        
        bool success = usdcToken.transfer(_winner, bet.totalWager);
        
        if (success) {
            emit BetResolved(_winner, bet.totalWager);
        } else {
            emit PayoutFailed(_winner, bet.totalWager);
            bet.status = BetStatus.FullyFunded; // Revert to fully funded state
        }
    }

    function checkExpiration() public {
        require(bet.status == BetStatus.FullyFunded, "Bet is not in a state that can expire");
        require(block.number >= bet.expirationBlock, "Bet has not expired yet");
        
        bet.status = BetStatus.Expired;
        emit BetExpired();
        
        _refundBettors();
    }

    function cancelBet() public {
        require(msg.sender == bet.maker || msg.sender == bet.taker || msg.sender == bet.judge, "Only maker, taker, or judge can cancel.");
        require(bet.status != BetStatus.Resolved && bet.status != BetStatus.Invalidated && bet.status != BetStatus.Expired, "Bet cannot be cancelled.");
        
        if (bet.status == BetStatus.FullyFunded) {
            require(msg.sender == bet.judge, "Only judge can cancel a fully funded bet.");
            require(block.number < bet.expirationBlock, "Bet has expired");
        }
        
        bet.status = BetStatus.Invalidated;
        
        emit BetCancelled(msg.sender);
        
        _refundBettors();
    }

    function invalidateBet() public {
        require(msg.sender == bet.judge, "Only the judge can invalidate the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        bet.status = BetStatus.Invalidated;
        
        emit BetInvalidated();
        
        _refundBettors();
    }

    function _refundBettors() private {
        // Refund each bettor only the amount they have funded, which may be uneven
        if (fundedAmount[bet.maker] > 0) {
            bool success = usdcToken.transfer(bet.maker, fundedAmount[bet.maker]);
            if (!success) {
                emit PayoutFailed(bet.maker, fundedAmount[bet.maker]);
            }
        }
        if (fundedAmount[bet.taker] > 0) {
            bool success = usdcToken.transfer(bet.taker, fundedAmount[bet.taker]);
            if (!success) {
                emit PayoutFailed(bet.taker, fundedAmount[bet.taker]);
            }
        }
    }
}