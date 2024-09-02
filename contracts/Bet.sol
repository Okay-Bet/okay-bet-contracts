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
        bool finalized;
    }
    
    BetDetails public bet;
    IERC20 public wagerCurrency;
    mapping(address => uint256) public fundedAmount;

    event BetCreated(address indexed maker, address indexed taker, address indexed judge, uint256 totalWager, uint8 wagerRatio, string conditions, uint256 expirationBlock);
    event BetFunded(address indexed funder, uint256 amount);
    event BetFullyFunded();
    event BetResolved(address indexed winner, uint256 amount);
    event BetInvalidated();
    event BetCancelled(address indexed canceller);
    event BetExpired();
    event PayoutFailed(address indexed recipient, uint256 amount);
    event BetFinalized();

    modifier notFinalized() {
        require(!bet.finalized, "Bet has been finalized");
        _;
    }

    constructor(
        address _maker,
        address _taker,
        address _judge,
        uint256 _totalWager,
        uint8 _wagerRatio,
        string memory _conditions,
        address _wagerCurrency,
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
        bet.finalized = false;
        wagerCurrency = _wagerCurrency == address(0) ? IERC20(address(0)) : IERC20(_wagerCurrency);

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

    function fundBet(uint256 amount) public payable notFinalized {
        require(msg.sender == bet.maker || msg.sender == bet.taker || msg.sender == tx.origin, "Only the maker or taker can fund the bet.");
        address funder = (msg.sender == bet.maker || msg.sender == bet.taker) ? msg.sender : tx.origin;
        require(funder == bet.maker || funder == bet.taker, "Only the maker or taker can fund the bet.");
        require(bet.status == BetStatus.Unfunded || bet.status == BetStatus.PartiallyFunded, "Bet is not in a fundable state.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        uint256 expectedAmount = getWagerAmount(funder);
        require(amount + fundedAmount[funder] <= expectedAmount, "Overfunding not allowed.");

        if (address(wagerCurrency) == address(0)) {
            require(msg.value == amount, "Sent ETH must match the funding amount");
        } else {
            require(msg.value == 0, "ETH not accepted for token bets");
            require(wagerCurrency.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        }
        
        fundedAmount[funder] += amount;
        
        emit BetFunded(funder, amount);

        if (fundedAmount[bet.maker] == getWagerAmount(bet.maker) && 
            fundedAmount[bet.taker] == getWagerAmount(bet.taker)) {
            bet.status = BetStatus.FullyFunded;
            emit BetFullyFunded();
        } else if (bet.status == BetStatus.Unfunded) {
            bet.status = BetStatus.PartiallyFunded;
        }
    }

    function resolveBet(address _winner) public notFinalized {
        require(msg.sender == bet.judge, "Only the judge can resolve the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(_winner == bet.maker || _winner == bet.taker, "Invalid winner address.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        bet.winner = _winner;
        bet.status = BetStatus.Resolved;
        
        uint256 winnings = bet.totalWager;
        
        if (address(wagerCurrency) == address(0)) {
            (bool success, ) = _winner.call{value: winnings}("");
            require(success, "ETH transfer failed");
        } else {
            require(wagerCurrency.transfer(_winner, winnings), "Token transfer failed");
        }
        
        emit BetResolved(_winner, winnings);
        _finalizeBet();
    }

    function checkExpiration() public notFinalized {
        require(bet.status != BetStatus.Resolved && bet.status != BetStatus.Invalidated, "Bet is not in a state that can expire");
        require(block.number >= bet.expirationBlock, "Bet has not expired yet");
        
        bet.status = BetStatus.Expired;
        emit BetExpired();
        
        _refundBettors();
        _finalizeBet();
    }

    function cancelBet() public notFinalized {
        require(msg.sender == bet.maker || msg.sender == bet.taker || msg.sender == bet.judge, "Only maker, taker, or judge can cancel.");
        require(bet.status != BetStatus.Resolved && bet.status != BetStatus.Invalidated && bet.status != BetStatus.Expired, "Bet cannot be cancelled.");
        
        if (bet.status == BetStatus.FullyFunded) {
            require(msg.sender == bet.judge, "Only judge can cancel a fully funded bet.");
            require(block.number < bet.expirationBlock, "Bet has expired");
        }
        
        bet.status = BetStatus.Invalidated;
        
        emit BetCancelled(msg.sender);
        
        _refundBettors();
        _finalizeBet();
    }

    function invalidateBet() public notFinalized {
        require(msg.sender == bet.judge, "Only the judge can invalidate the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        bet.status = BetStatus.Invalidated;
        
        emit BetInvalidated();
        
        _refundBettors();
        _finalizeBet();
    }

    function _refundBettors() private {
        if (address(wagerCurrency) == address(0)) {
            if (fundedAmount[bet.maker] > 0) {
                (bool success, ) = bet.maker.call{value: fundedAmount[bet.maker]}("");
                if (!success) {
                    emit PayoutFailed(bet.maker, fundedAmount[bet.maker]);
                }
            }
            if (fundedAmount[bet.taker] > 0) {
                (bool success, ) = bet.taker.call{value: fundedAmount[bet.taker]}("");
                if (!success) {
                    emit PayoutFailed(bet.taker, fundedAmount[bet.taker]);
                }
            }
        } else {
            if (fundedAmount[bet.maker] > 0) {
                bool success = wagerCurrency.transfer(bet.maker, fundedAmount[bet.maker]);
                if (!success) {
                    emit PayoutFailed(bet.maker, fundedAmount[bet.maker]);
                }
            }
            if (fundedAmount[bet.taker] > 0) {
                bool success = wagerCurrency.transfer(bet.taker, fundedAmount[bet.taker]);
                if (!success) {
                    emit PayoutFailed(bet.taker, fundedAmount[bet.taker]);
                }
            }
        }
        fundedAmount[bet.maker] = 0;
        fundedAmount[bet.taker] = 0;
    }

    function _finalizeBet() private {
        bet.finalized = true;
        emit BetFinalized();
    }

    // View functions to easily access bet details
    function getBetDetails() public view returns (
        address maker,
        address taker,
        address judge,
        uint256 totalWager,
        uint8 wagerRatio,
        string memory conditions,
        BetStatus status,
        address winner,
        uint256 expirationBlock,
        bool finalized
    ) {
        return (
            bet.maker,
            bet.taker,
            bet.judge,
            bet.totalWager,
            bet.wagerRatio,
            bet.conditions,
            bet.status,
            bet.winner,
            bet.expirationBlock,
            bet.finalized
        );
    }

    function isBetFinalized() public view returns (bool) {
        return bet.finalized;
    }

    function getBetWinner() public view returns (address) {
        require(bet.finalized, "Bet is not finalized yet");
        return bet.winner;
    }

    function getBetStatus() public view returns (BetStatus) {
        return bet.status;
    }

    // Reject any incoming ETH
    receive() external payable {
        revert("Contract does not accept direct ETH transfers");
    }

    // Reject any incoming ETH sent as a fallback
    fallback() external payable {
        revert("Contract does not accept direct ETH transfers");
    }
}