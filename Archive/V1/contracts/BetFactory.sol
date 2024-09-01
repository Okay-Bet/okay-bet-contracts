// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Bet.sol";

contract BetFactory {
    Bet[] public bets;

    event BetCreated(address betAddress, address better1, address better2, address decider, uint256 wager, string conditions);

function createBet(address _better1, address _better2, address _decider, uint256 _wager, string memory _conditions) public {
    require(_better1 != _better2, "Bettors must be different addresses");
    require(_better1 != address(0) && _better2 != address(0) && _decider != address(0), "Invalid address");
    require(_wager > 0, "Wager must be greater than 0");

    Bet newBet = new Bet(_better1, _better2, _decider, _wager, _conditions);
    bets.push(newBet);
    emit BetCreated(address(newBet), _better1, _better2, _decider, _wager, _conditions);
}

    function getBets() public view returns (Bet[] memory) {
        return bets;
    }
}