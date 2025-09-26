# Investment Fund Smart Contracts

## Overview
Smart contract system for creating tokenized investment funds on Polygon. Allows fund managers to create funds, agents to trade with pooled capital, and investors to participate through ERC20 share tokens.

## Contracts

### InvestmentFund.sol
- Three-phase lifecycle: Deposit → Trading → Redemption
- ERC20 share tokens representing investor ownership
- Dead shares protection (1000 tokens to 0xdead)
- Fee structure: optional entry fee + carried interest on profits
- Emergency pause mechanism

### FundFactory.sol
- Deploys standardized investment funds
- Agent whitelisting system
- Protocol fee collection
- Fund registry and tracking

## Installation

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm run test
```

## Deploy

1. Copy `.env.example` to `.env` and fill in required values
2. Run deployment script:

```bash
npm run deploy:testnet
```

## Security Features

- ReentrancyGuard protection
- Pausable circuit breaker
- Agent whitelist requirement
- First depositor attack mitigation
- Time-based phase enforcement
- Stack overflow protection via IR compilation

## Testing Coverage

- 34 comprehensive tests
- Deposit mechanics
- Trading phase restrictions  
- Profit calculations
- Fee distributions
- Emergency procedures

## License

MIT