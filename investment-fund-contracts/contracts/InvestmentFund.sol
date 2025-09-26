// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract InvestmentFund is ERC20, ReentrancyGuard, Pausable, Ownable {
    enum FundPhase { DEPOSIT, TRADING, REDEMPTION, COMPLETED }
    
    IERC20 public immutable usdc;
    address public immutable agentWallet;
    address public immutable fundManager;
    
    uint256 public immutable targetRaise;
    uint256 public immutable tradingDuration;
    uint256 public immutable entryFee;
    uint256 public immutable carriedInterest;
    uint256 public immutable minInvestment;
    uint256 public immutable depositDeadline;
    
    uint256 public totalDeposits;
    uint256 public tradingStartTime;
    uint256 public finalFundValue;
    uint256 public totalProfit;
    bool public profitCalculated;
    bool public deadSharesMinted;
    
    FundPhase public currentPhase;
    
    mapping(address => uint256) public userDeposits;
    
    event Deposit(address indexed investor, uint256 amount, uint256 shares);
    event TradingStarted(uint256 timestamp, uint256 totalFunds);
    event FundsReturned(uint256 amount);
    event Withdrawal(address indexed investor, uint256 amount);
    event PhaseTransition(FundPhase newPhase);
    event ProfitCalculated(uint256 finalValue, uint256 profit);
    
    struct FundParams {
        string fundName;
        address usdc;
        address agentWallet;
        address fundManager;
        uint256 targetRaise;
        uint256 tradingDuration;
        uint256 entryFee;
        uint256 carriedInterest;
        uint256 minInvestment;
        uint256 depositDeadline;
    }

    constructor(
        FundParams memory params
    ) ERC20(params.fundName, "FUND") Ownable(msg.sender) {
        require(params.usdc != address(0), "Invalid USDC address");
        require(params.agentWallet != address(0), "Invalid agent wallet");
        require(params.fundManager != address(0), "Invalid fund manager");
        require(params.targetRaise > 0, "Target raise must be positive");
        require(params.tradingDuration > 0, "Trading duration must be positive");
        require(params.entryFee <= 500, "Entry fee too high");
        require(params.carriedInterest <= 5000, "Carried interest too high");
        require(params.depositDeadline > block.timestamp, "Invalid deadline");
        
        usdc = IERC20(params.usdc);
        agentWallet = params.agentWallet;
        fundManager = params.fundManager;
        targetRaise = params.targetRaise;
        tradingDuration = params.tradingDuration;
        entryFee = params.entryFee;
        carriedInterest = params.carriedInterest;
        minInvestment = params.minInvestment;
        depositDeadline = params.depositDeadline;
        
        currentPhase = FundPhase.DEPOSIT;
    }
    
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(currentPhase == FundPhase.DEPOSIT, "Not in deposit phase");
        require(block.timestamp <= depositDeadline, "Deposit deadline passed");
        require(amount >= minInvestment, "Below minimum investment");
        require(totalDeposits + amount <= targetRaise, "Exceeds target raise");
        
        if (!deadSharesMinted) {
            _mint(address(0xdead), 1000);
            deadSharesMinted = true;
        }
        
        uint256 depositAmount = amount;
        uint256 feeAmount = 0;
        
        if (entryFee > 0) {
            feeAmount = (amount * entryFee) / 10000;
            depositAmount = amount - feeAmount;
        }
        
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        if (feeAmount > 0) {
            require(usdc.transfer(fundManager, feeAmount), "Fee transfer failed");
        }
        
        uint256 sharesToMint = depositAmount;
        if (totalSupply() > 1000) {
            sharesToMint = (depositAmount * totalSupply()) / totalDeposits;
        }
        
        _mint(msg.sender, sharesToMint);
        userDeposits[msg.sender] += depositAmount;
        totalDeposits += depositAmount;
        
        emit Deposit(msg.sender, amount, sharesToMint);
    }
    
    function startTrading() external nonReentrant {
        require(currentPhase == FundPhase.DEPOSIT, "Not in deposit phase");
        require(
            msg.sender == fundManager || 
            msg.sender == agentWallet || 
            block.timestamp > depositDeadline,
            "Not authorized to start trading"
        );
        require(totalDeposits > 0, "No deposits to trade");
        
        currentPhase = FundPhase.TRADING;
        tradingStartTime = block.timestamp;
        
        uint256 balance = usdc.balanceOf(address(this));
        require(usdc.transfer(agentWallet, balance), "Transfer to agent failed");
        
        emit TradingStarted(block.timestamp, balance);
        emit PhaseTransition(FundPhase.TRADING);
    }
    
    function returnFunds(uint256 amount) external nonReentrant {
        require(currentPhase == FundPhase.TRADING, "Not in trading phase");
        require(msg.sender == agentWallet, "Only agent can return funds");
        
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        currentPhase = FundPhase.REDEMPTION;
        emit FundsReturned(amount);
        emit PhaseTransition(FundPhase.REDEMPTION);
    }
    
    function calculateProfit() external nonReentrant {
        require(currentPhase == FundPhase.REDEMPTION, "Not in redemption phase");
        require(!profitCalculated, "Profit already calculated");
        
        finalFundValue = usdc.balanceOf(address(this));
        
        if (finalFundValue > totalDeposits) {
            totalProfit = finalFundValue - totalDeposits;
            
            if (carriedInterest > 0 && totalProfit > 0) {
                uint256 carry = (totalProfit * carriedInterest) / 10000;
                require(usdc.transfer(fundManager, carry), "Carry transfer failed");
                finalFundValue -= carry;
            }
        }
        
        profitCalculated = true;
        emit ProfitCalculated(finalFundValue, totalProfit);
    }
    
    function withdraw() external nonReentrant whenNotPaused {
        require(currentPhase == FundPhase.REDEMPTION, "Not in redemption phase");
        require(profitCalculated, "Profit not yet calculated");
        require(balanceOf(msg.sender) > 0, "No shares to redeem");
        
        uint256 shares = balanceOf(msg.sender);
        uint256 totalShares = totalSupply();
        uint256 withdrawAmount = (finalFundValue * shares) / totalShares;
        
        _burn(msg.sender, shares);
        require(usdc.transfer(msg.sender, withdrawAmount), "Withdrawal failed");
        
        if (totalSupply() == 1000) {
            currentPhase = FundPhase.COMPLETED;
            emit PhaseTransition(FundPhase.COMPLETED);
        }
        
        emit Withdrawal(msg.sender, withdrawAmount);
    }
    
    function emergencyPause() external {
        require(msg.sender == owner() || msg.sender == fundManager, "Not authorized");
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function getCurrentPhase() external view returns (FundPhase) {
        if (currentPhase == FundPhase.DEPOSIT && block.timestamp > depositDeadline) {
            return FundPhase.TRADING;
        }
        if (currentPhase == FundPhase.TRADING && 
            block.timestamp > tradingStartTime + tradingDuration) {
            return FundPhase.REDEMPTION;
        }
        return currentPhase;
    }
}