// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    uint8 private constant _decimals = 6;
    mapping(address => uint256) private _nonRevertableBalances;

    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000_000 * 10 ** _decimals);
    }

    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        _nonRevertableBalances[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
        _nonRevertableBalances[from] = _nonRevertableBalances[from] > amount
            ? _nonRevertableBalances[from] - amount
            : 0;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool success = super.transfer(to, amount);
        if (success) {
            _nonRevertableBalances[msg.sender] = _nonRevertableBalances[msg.sender] > amount
                ? _nonRevertableBalances[msg.sender] - amount
                : 0;
            _nonRevertableBalances[to] += amount;
        }
        return success;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool success = super.transferFrom(from, to, amount);
        if (success) {
            _nonRevertableBalances[from] = _nonRevertableBalances[from] > amount
                ? _nonRevertableBalances[from] - amount
                : 0;
            _nonRevertableBalances[to] += amount;
        }
        return success;
    }

    function nonRevertableBalanceOf(address account) external view returns (uint256) {
        return _nonRevertableBalances[account];
    }
}
