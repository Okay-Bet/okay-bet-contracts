# Investment Fund Contracts - Deployment Status

## Network Information
- **Network**: Polygon Amoy Testnet
- **Chain ID**: 80002
- **RPC URL**: https://rpc-amoy.polygon.technology
- **Explorer**: https://amoy.polygonscan.com

## Deployed Contracts

### FundFactory Contract
- **Address**: `0x5eA0B0b61A99c1AbAB3235fd1c358dEaFe426900`
- **Deployment Date**: September 27, 2025
- **Transaction**: [View on Explorer](https://amoy.polygonscan.com/address/0x5eA0B0b61A99c1AbAB3235fd1c358dEaFe426900)
- **Owner**: `0x33937d1634c1C0606D2A99599BD989424BA0B053`

### Test Investment Fund
- **Address**: `0x8A136572B7b72AE8582cc49FEB231c4850FE8cD0`
- **Name**: Low Min Test Fund
- **Minimum Investment**: 5 USDC
- **Target Raise**: 1,000 USDC
- **Entry Fee**: 1%
- **Carried Interest**: 15%
- **Trading Duration**: 2 days
- **Transaction**: [View on Explorer](https://amoy.polygonscan.com/address/0x8A136572B7b72AE8582cc49FEB231c4850FE8cD0)

### Token Addresses
- **USDC (Amoy Testnet)**: `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`

## Contract Interfaces

### FundFactory Interface

```solidity
interface IFundFactory {
    // Events
    event FundCreated(
        address indexed fund,
        address indexed manager,
        address indexed agent,
        string fundName,
        uint256 targetRaise
    );
    event AgentWhitelisted(address indexed agent, bool status);
    event ProtocolFeeUpdated(uint256 newFee);

    // Read Functions
    function usdc() external view returns (address);
    function protocolFee() external view returns (uint256);
    function whitelistedAgents(address agent) external view returns (bool);
    function managerFunds(address manager, uint256 index) external view returns (address);
    function agentFunds(address agent, uint256 index) external view returns (address);
    function allFunds(uint256 index) external view returns (address);

    // Write Functions
    function createFund(
        string memory fundName,
        address agentWallet,
        uint256 targetRaise,      // Min: 1000 USDC (1000 * 10^6)
        uint256 tradingDuration,  // In seconds, min: 1 day, max: 365 days
        uint256 entryFee,         // Basis points (100 = 1%), max: 500
        uint256 carriedInterest,  // Basis points (2000 = 20%), max: 5000
        uint256 minInvestment,    // Min: 5 USDC (5 * 10^6)
        uint256 depositDeadline   // Unix timestamp
    ) external returns (address);

    // Admin Functions (Owner only)
    function whitelistAgent(address agent, bool status) external;
    function setProtocolFee(uint256 newFee) external;
    function pause() external;
    function unpause() external;
}
```

### InvestmentFund Interface

```solidity
interface IInvestmentFund {
    // Events
    event Deposit(address indexed investor, uint256 usdcAmount, uint256 sharesIssued);
    event FundsTransferredToAgent(uint256 amount);
    event FundsReturnedFromAgent(uint256 amount);
    event Redemption(address indexed investor, uint256 shares, uint256 usdcAmount);
    event FinalNAVCalculated(uint256 totalAssets, uint256 totalShares, uint256 navPerShare);

    // Enums
    enum Phase { DEPOSIT, TRADING, REDEMPTION }

    // Read Functions
    function getCurrentPhase() external view returns (Phase);
    function totalDeposits() external view returns (uint256);
    function targetRaise() external view returns (uint256);
    function minInvestment() external view returns (uint256);
    function depositDeadline() external view returns (uint256);
    function tradingEndTime() external view returns (uint256);
    function agentWallet() external view returns (address);
    function fundManager() external view returns (address);
    function entryFee() external view returns (uint256);
    function carriedInterest() external view returns (uint256);
    function finalNAVPerShare() external view returns (uint256);
    function finalNAVCalculated() external view returns (bool);
    
    // ERC20 Functions (Share Token)
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);

    // Write Functions
    function deposit(uint256 usdcAmount) external;
    function transferFundsToAgent() external;
    function returnFundsFromAgent() external;
    function calculateFinalNAV() external;
    function redeem(uint256 shares) external;
    
    // Emergency Functions
    function emergencyPause() external;
    function emergencyUnpause() external;
}
```

## Frontend Integration Guide

### 1. Connect to Amoy Network
```javascript
const AMOY_CONFIG = {
  chainId: '0x13882', // 80002 in hex
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: {
    name: 'POL',
    symbol: 'POL',
    decimals: 18
  },
  rpcUrls: ['https://rpc-amoy.polygon.technology'],
  blockExplorerUrls: ['https://amoy.polygonscan.com']
};
```

### 2. Contract ABIs Location
- **FundFactory ABI**: `/artifacts/contracts/FundFactory.sol/FundFactory.json`
- **InvestmentFund ABI**: `/artifacts/contracts/InvestmentFund.sol/InvestmentFund.json`

### 3. Key Integration Points

#### Creating a Fund
1. Agent must be whitelisted first (only owner can whitelist)
2. Call `createFund()` with parameters
3. Listen for `FundCreated` event to get new fund address

#### Making a Deposit
1. User approves USDC spending to fund address
2. Call `deposit(amount)` on the fund contract
3. User receives share tokens representing their investment

#### Fund Phases
- **DEPOSIT**: Accepts investments until deadline
- **TRADING**: Funds sent to agent wallet for trading
- **REDEMPTION**: Users can redeem shares for USDC + profits

#### Viewing Fund Status
```javascript
// Get current phase
const phase = await fund.getCurrentPhase();
// 0 = DEPOSIT, 1 = TRADING, 2 = REDEMPTION

// Get fund progress
const totalDeposits = await fund.totalDeposits();
const targetRaise = await fund.targetRaise();
const progress = (totalDeposits * 100n) / targetRaise;

// Get user's investment
const userShares = await fund.balanceOf(userAddress);
```

## Testing Resources

### Test Token Faucets
- **POL (Gas)**: https://faucet.polygon.technology/
- **USDC**: https://faucet.circle.com (select Polygon Amoy)

### Test Wallets
- **Deployer/Owner**: `0x33937d1634c1C0606D2A99599BD989424BA0B053`
- **Test Agent**: `0x33937d1634c1C0606D2A99599BD989424BA0B053` (same as deployer for testing)

## Important Notes

1. **USDC Decimals**: USDC uses 6 decimals, not 18 like most ERC20s
   ```javascript
   const amount = ethers.parseUnits("100", 6); // 100 USDC
   ```

2. **Basis Points**: Fees are in basis points (100 = 1%, 10000 = 100%)

3. **Minimum Requirements**:
   - Minimum investment per user: 5 USDC
   - Minimum fund target raise: 1,000 USDC
   - Minimum trading duration: 1 day
   - Maximum entry fee: 5%
   - Maximum carried interest: 50%

4. **Dead Shares Protection**: First deposit mints 1000 shares to dead address to prevent inflation attacks

## Current Status
- ✅ Contracts deployed and verified
- ✅ Factory configured with 50 basis points (0.5%) protocol fee
- ✅ Test fund created with 5 USDC minimum investment
- ✅ Successfully tested deposit functionality
- ⏳ Awaiting frontend integration

## Support
For technical questions about contract integration, please refer to:
- Contract source code in `/contracts/` directory
- Test files in `/test/` directory for usage examples
- Deployment scripts in `/deploy/` for interaction patterns

Last Updated: September 27, 2025