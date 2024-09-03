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
    uint8 wagerRatio;
    string conditions;
    BetStatus status;
    address winner;
    uint256 expirationBlock;
    bool finalized;
    address wagerCurrency; 
}
    
    BetDetails public bet;
    mapping(address => uint256) public fundedAmount;

    event BetCreated(
        address indexed betAddress,
        address indexed maker,
        address indexed taker,
        address judge,
        uint256 totalWager,
        uint8 wagerRatio,
        string conditions,
        uint64 creationTimestamp,
        uint32 expirationBlock
    );

    event BetFunded(
        address indexed betAddress,
        address indexed funder,
        uint256 amount,
        BetStatus newStatus
    );

    event BetStatusChanged(
        address indexed betAddress,
        BetStatus indexed oldStatus,
        BetStatus indexed newStatus,
        uint64 timestamp
    );

    event BetResolved(
        address indexed betAddress,
        address indexed winner,
        uint256 winningAmount,
        uint64 resolutionTimestamp
    );

    event BetInvalidated(
        address indexed betAddress,
        address indexed invalidator,
        string reason,
        uint64 invalidationTimestamp
    );

    event PayoutFailed(address indexed recipient, uint256 amount);

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
        bet.wagerCurrency = _wagerCurrency;

        emit BetCreated(
            address(this),
            _maker,
            _taker,
            _judge,
            _totalWager,
            _wagerRatio,
            _conditions,
            uint64(block.timestamp),
            uint32(bet.expirationBlock)
        );
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

        if (bet.wagerCurrency== address(0)) {
            require(msg.value == amount, "Sent ETH must match the funding amount");
        } else {
            require(msg.value == 0, "ETH not accepted for token bets");
            require(IERC20(bet.wagerCurrency).transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        }
        
        fundedAmount[funder] += amount;
        
        BetStatus oldStatus = bet.status;
        if (fundedAmount[bet.maker] == getWagerAmount(bet.maker) && 
            fundedAmount[bet.taker] == getWagerAmount(bet.taker)) {
            bet.status = BetStatus.FullyFunded;
        } else if (bet.status == BetStatus.Unfunded) {
            bet.status = BetStatus.PartiallyFunded;
        }
        
        emit BetFunded(address(this), funder, amount, bet.status);
        
        if (oldStatus != bet.status) {
            emit BetStatusChanged(address(this), oldStatus, bet.status, uint64(block.timestamp));
            }
    }

    function resolveBet(address _winner) public notFinalized {
        require(msg.sender == bet.judge, "Only the judge can resolve the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(_winner == bet.maker || _winner == bet.taker, "Invalid winner address.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        bet.winner = _winner;
        BetStatus oldStatus = bet.status;
        bet.status = BetStatus.Resolved;
        
        uint256 winnings = bet.totalWager;
        
        if (address(bet.wagerCurrency) == address(0)) {
            (bool success, ) = _winner.call{value: winnings}("");
            require(success, "ETH transfer failed");
        } else {
            require(IERC20(bet.wagerCurrency).transfer(_winner, winnings), "Token transfer failed");
        }
        
        emit BetResolved(address(this), _winner, winnings, uint64(block.timestamp));
        emit BetStatusChanged(address(this), oldStatus, bet.status, uint64(block.timestamp));
        _finalizeBet();
    }

    function checkExpiration() public notFinalized {
        require(bet.status != BetStatus.Resolved && bet.status != BetStatus.Invalidated, "Bet is not in a state that can expire");
        require(block.number >= bet.expirationBlock, "Bet has not expired yet");
        
        BetStatus oldStatus = bet.status;
        bet.status = BetStatus.Expired;
        
        emit BetStatusChanged(address(this), oldStatus, bet.status, uint64(block.timestamp));
        emit BetInvalidated(address(this), address(this), "Bet expired", uint64(block.timestamp));
        
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
        
        BetStatus oldStatus = bet.status;
        bet.status = BetStatus.Invalidated;
        
        emit BetStatusChanged(address(this), oldStatus, bet.status, uint64(block.timestamp));
        emit BetInvalidated(address(this), msg.sender, "Bet cancelled", uint64(block.timestamp));
        
        _refundBettors();
        _finalizeBet();
    }

    function invalidateBet() public notFinalized {
        require(msg.sender == bet.judge, "Only the judge can invalidate the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(block.number < bet.expirationBlock, "Bet has expired");
        
        BetStatus oldStatus = bet.status;
        bet.status = BetStatus.Invalidated;
        
        emit BetStatusChanged(address(this), oldStatus, bet.status, uint64(block.timestamp));
        emit BetInvalidated(address(this), msg.sender, "Bet invalidated by judge", uint64(block.timestamp));
        
        _refundBettors();
        _finalizeBet();
    }

    function _refundBettors() private {
        if (address(bet.wagerCurrency) == address(0)) {
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
                bool success = IERC20(bet.wagerCurrency).transfer(bet.maker, fundedAmount[bet.maker]);
                if (!success) {
                    emit PayoutFailed(bet.maker, fundedAmount[bet.maker]);
                }
            }
            if (fundedAmount[bet.taker] > 0) {
                bool success = IERC20(bet.wagerCurrency).transfer(bet.taker, fundedAmount[bet.taker]);
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
    }

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
    bool finalized,
    address wagerCurrency 
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
        bet.finalized,
        bet.wagerCurrency
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