// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./InvestmentFund.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract FundFactory is Ownable, Pausable {
    address public immutable usdc;
    uint256 public protocolFee;
    uint256 public constant MAX_PROTOCOL_FEE = 100;
    
    mapping(address => bool) public whitelistedAgents;
    mapping(address => address[]) public managerFunds;
    mapping(address => address[]) public agentFunds;
    
    address[] public allFunds;
    
    event FundCreated(
        address indexed fund,
        address indexed manager,
        address indexed agent,
        string fundName,
        uint256 targetRaise
    );
    event AgentWhitelisted(address indexed agent, bool status);
    event ProtocolFeeUpdated(uint256 newFee);
    event ProtocolFeeCollected(address indexed fund, uint256 amount);
    
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = _usdc;
        protocolFee = 50;
    }
    
    function createFund(
        string memory fundName,
        address agentWallet,
        uint256 targetRaise,
        uint256 tradingDuration,
        uint256 entryFee,
        uint256 carriedInterest,
        uint256 minInvestment,
        uint256 depositDeadline
    ) external whenNotPaused returns (address) {
        require(whitelistedAgents[agentWallet], "Agent not whitelisted");
        require(targetRaise >= 1000 * 10**6, "Target raise too low");
        require(targetRaise <= 10000000 * 10**6, "Target raise too high");
        require(tradingDuration >= 1 days, "Trading duration too short");
        require(tradingDuration <= 365 days, "Trading duration too long");
        require(entryFee <= 500, "Entry fee too high");
        require(carriedInterest <= 5000, "Carried interest too high");
        require(minInvestment >= 5 * 10**6, "Min investment too low");
        require(depositDeadline > block.timestamp + 1 hours, "Deadline too soon");
        require(depositDeadline < block.timestamp + 30 days, "Deadline too far");
        
        uint256 adjustedEntryFee = entryFee;
        if (protocolFee > 0 && entryFee > 0) {
            uint256 protocolCut = (entryFee * protocolFee) / 10000;
            adjustedEntryFee = entryFee - protocolCut;
        }
        
        InvestmentFund.FundParams memory params = InvestmentFund.FundParams({
            fundName: fundName,
            usdc: usdc,
            agentWallet: agentWallet,
            fundManager: msg.sender,
            targetRaise: targetRaise,
            tradingDuration: tradingDuration,
            entryFee: adjustedEntryFee,
            carriedInterest: carriedInterest,
            minInvestment: minInvestment,
            depositDeadline: depositDeadline
        });
        
        InvestmentFund fund = new InvestmentFund(params);
        
        address fundAddress = address(fund);
        
        allFunds.push(fundAddress);
        managerFunds[msg.sender].push(fundAddress);
        agentFunds[agentWallet].push(fundAddress);
        
        emit FundCreated(
            fundAddress,
            msg.sender,
            agentWallet,
            fundName,
            targetRaise
        );
        
        return fundAddress;
    }
    
    function whitelistAgent(address agent, bool status) external onlyOwner {
        require(agent != address(0), "Invalid agent address");
        whitelistedAgents[agent] = status;
        emit AgentWhitelisted(agent, status);
    }
    
    function batchWhitelistAgents(
        address[] calldata agents,
        bool[] calldata statuses
    ) external onlyOwner {
        require(agents.length == statuses.length, "Array length mismatch");
        
        for (uint256 i = 0; i < agents.length; i++) {
            require(agents[i] != address(0), "Invalid agent address");
            whitelistedAgents[agents[i]] = statuses[i];
            emit AgentWhitelisted(agents[i], statuses[i]);
        }
    }
    
    function setProtocolFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_PROTOCOL_FEE, "Fee too high");
        protocolFee = newFee;
        emit ProtocolFeeUpdated(newFee);
    }
    
    function collectProtocolFee(address fund) external onlyOwner {
        InvestmentFund fundContract = InvestmentFund(fund);
        require(fundContract.currentPhase() == InvestmentFund.FundPhase.REDEMPTION, "Fund not in redemption phase");
        
        uint256 totalProfit = fundContract.totalProfit();
        if (totalProfit > 0 && protocolFee > 0) {
            uint256 feeAmount = (totalProfit * protocolFee) / 10000;
            IERC20(usdc).transferFrom(fund, owner(), feeAmount);
            emit ProtocolFeeCollected(fund, feeAmount);
        }
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function getAllFunds() external view returns (address[] memory) {
        return allFunds;
    }
    
    function getManagerFunds(address manager) external view returns (address[] memory) {
        return managerFunds[manager];
    }
    
    function getAgentFunds(address agent) external view returns (address[] memory) {
        return agentFunds[agent];
    }
    
    function getFundCount() external view returns (uint256) {
        return allFunds.length;
    }
    
    function getFundDetails(address fund) external view returns (
        string memory fundName,
        address agentWallet,
        address fundManager,
        uint256 targetRaise,
        uint256 tradingDuration,
        uint256 totalDeposits,
        uint8 currentPhase
    ) {
        InvestmentFund fundContract = InvestmentFund(fund);
        
        fundName = fundContract.name();
        agentWallet = fundContract.agentWallet();
        fundManager = fundContract.fundManager();
        targetRaise = fundContract.targetRaise();
        tradingDuration = fundContract.tradingDuration();
        totalDeposits = fundContract.totalDeposits();
        currentPhase = uint8(fundContract.currentPhase());
    }
}