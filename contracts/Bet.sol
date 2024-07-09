// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Bet {
    enum BetStatus { Unfunded, Better1Funded, Better2Funded, FullyFunded, Resolved, Invalidated }    
    struct BetDetails {
        address better1;
        address better2;
        address decider;
        uint256 wager;
        string conditions;
        BetStatus status;
        address winner;
    }
    
    BetDetails public bet;
    mapping(address => bool) public hasFunded;

    event BetCreated(address better1, address better2, address decider, uint256 wager, string conditions);
    event BetFunded(address funder, uint256 amount);
    event BetFullyFunded();
    event BetResolved(address winner);
    event BetInvalidated();
    event BetCancelled(address canceller);

    constructor(address _better1, address _better2, address _decider, uint256 _wager, string memory _conditions) {
        require(_better1 != _better2, "Bettors must be different addresses");
        require(_better1 != address(0) && _better2 != address(0) && _decider != address(0), "Invalid address");
        require(_wager > 0, "Wager must be greater than 0");
        
        bet.better1 = _better1;
        bet.better2 = _better2;
        bet.decider = _decider;
        bet.wager = _wager;
        bet.conditions = _conditions;
        bet.status = BetStatus.Unfunded;
        
        emit BetCreated(_better1, _better2, _decider, _wager, _conditions);
    }

    function fundBet() public payable {
        require(msg.sender == bet.better1 || msg.sender == bet.better2, "Only the bettors can fund the bet.");
        require(bet.status == BetStatus.Unfunded || bet.status == BetStatus.Better1Funded || bet.status == BetStatus.Better2Funded, "Bet is not in a fundable state.");
        require(msg.value == bet.wager, "Incorrect wager amount.");
        require(!hasFunded[msg.sender], "You have already funded your part.");

        hasFunded[msg.sender] = true;

        if (msg.sender == bet.better1) {
            require(bet.status == BetStatus.Unfunded || bet.status == BetStatus.Better2Funded, "Better1 has already funded.");
            bet.status = bet.status == BetStatus.Better2Funded ? BetStatus.FullyFunded : BetStatus.Better1Funded;
        } else {
            require(bet.status == BetStatus.Unfunded || bet.status == BetStatus.Better1Funded, "Better2 has already funded.");
            bet.status = bet.status == BetStatus.Better1Funded ? BetStatus.FullyFunded : BetStatus.Better2Funded;
        }

        emit BetFunded(msg.sender, msg.value);

        if (bet.status == BetStatus.FullyFunded) {
            emit BetFullyFunded();
        }
    }


    function resolveBet(address _winner) public {
        require(msg.sender == bet.decider, "Only the decider can resolve the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        require(_winner == bet.better1 || _winner == bet.better2, "Invalid winner address.");
        
        bet.winner = _winner;
        bet.status = BetStatus.Resolved;
        
        emit BetResolved(_winner);
        
        payable(_winner).transfer(address(this).balance);
    }

    function invalidateBet() public {
        require(msg.sender == bet.decider, "Only the decider can invalidate the bet.");
        require(bet.status == BetStatus.FullyFunded, "Bet is not fully funded.");
        
        bet.status = BetStatus.Invalidated;
        
        emit BetInvalidated();
        
        if (hasFunded[bet.better1]) {
            payable(bet.better1).transfer(bet.wager);
        }
        if (hasFunded[bet.better2]) {
            payable(bet.better2).transfer(bet.wager);
        }
    }

    function cancelBet() public {
        require(msg.sender == bet.better1 || msg.sender == bet.better2 || msg.sender == bet.decider, "Only bettors or decider can cancel.");
        require(bet.status != BetStatus.Resolved && bet.status != BetStatus.Invalidated, "Bet cannot be cancelled.");
        
        if (bet.status == BetStatus.FullyFunded) {
            require(msg.sender == bet.decider, "Only decider can cancel a fully funded bet.");
        }
        
        bet.status = BetStatus.Invalidated;
        
        emit BetCancelled(msg.sender);
        
        if (hasFunded[bet.better1]) {
            payable(bet.better1).transfer(bet.wager);
        }
        if (hasFunded[bet.better2]) {
            payable(bet.better2).transfer(bet.wager);
        }
    }
}