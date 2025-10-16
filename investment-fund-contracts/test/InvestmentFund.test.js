const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("InvestmentFund", function () {
  let fund;
  let usdc;
  let owner, manager, agent, investor1, investor2;
  let fundFactory;
  
  const TARGET_RAISE = ethers.parseUnits("10000", 6);
  const MIN_INVESTMENT = ethers.parseUnits("100", 6);
  const ENTRY_FEE = 200;
  const CARRIED_INTEREST = 2000;
  const TRADING_DURATION = 7 * 24 * 60 * 60;
  
  beforeEach(async function () {
    [owner, manager, agent, investor1, investor2] = await ethers.getSigners();
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    
    const depositDeadline = (await time.latest()) + 86400;
    
    const InvestmentFund = await ethers.getContractFactory("InvestmentFund");
    
    const fundParams = {
      fundName: "Test Fund",
      usdc: await usdc.getAddress(),
      agentWallet: agent.address,
      fundManager: manager.address,
      targetRaise: TARGET_RAISE,
      tradingDuration: TRADING_DURATION,
      entryFee: ENTRY_FEE,
      carriedInterest: CARRIED_INTEREST,
      minInvestment: MIN_INVESTMENT,
      depositDeadline: depositDeadline
    };
    
    fund = await InvestmentFund.deploy(fundParams);
    
    await usdc.mint(investor1.address, ethers.parseUnits("5000", 6));
    await usdc.mint(investor2.address, ethers.parseUnits("5000", 6));
    await usdc.connect(investor1).approve(await fund.getAddress(), ethers.parseUnits("5000", 6));
    await usdc.connect(investor2).approve(await fund.getAddress(), ethers.parseUnits("5000", 6));
  });
  
  describe("Deployment", function () {
    it("Should set the correct parameters", async function () {
      expect(await fund.agentWallet()).to.equal(agent.address);
      expect(await fund.fundManager()).to.equal(manager.address);
      expect(await fund.targetRaise()).to.equal(TARGET_RAISE);
      expect(await fund.entryFee()).to.equal(ENTRY_FEE);
      expect(await fund.carriedInterest()).to.equal(CARRIED_INTEREST);
      expect(await fund.minInvestment()).to.equal(MIN_INVESTMENT);
    });
    
    it("Should start in deposit phase", async function () {
      expect(await fund.currentPhase()).to.equal(0);
    });
  });
  
  describe("Deposit Phase", function () {
    it("Should accept deposits and mint shares", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await fund.connect(investor1).deposit(depositAmount);
      
      expect(await fund.totalDeposits()).to.be.gt(0);
      expect(await fund.balanceOf(investor1.address)).to.be.gt(0);
    });
    
    it("Should mint dead shares on first deposit", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await fund.connect(investor1).deposit(depositAmount);
      
      expect(await fund.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(1000);
    });
    
    it("Should apply entry fee correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const expectedFee = (depositAmount * BigInt(ENTRY_FEE)) / 10000n;
      
      const managerBalanceBefore = await usdc.balanceOf(manager.address);
      await fund.connect(investor1).deposit(depositAmount);
      const managerBalanceAfter = await usdc.balanceOf(manager.address);
      
      expect(managerBalanceAfter - managerBalanceBefore).to.equal(expectedFee);
    });
    
    it("Should reject deposits below minimum", async function () {
      const depositAmount = ethers.parseUnits("50", 6);
      
      await expect(fund.connect(investor1).deposit(depositAmount))
        .to.be.revertedWith("Below minimum investment");
    });
    
    it("Should reject deposits exceeding target raise", async function () {
      const depositAmount = ethers.parseUnits("11000", 6);
      await usdc.mint(investor1.address, depositAmount);
      await usdc.connect(investor1).approve(await fund.getAddress(), depositAmount);
      
      await expect(fund.connect(investor1).deposit(depositAmount))
        .to.be.revertedWith("Exceeds target raise");
    });
  });
  
  describe("Trading Phase", function () {
    beforeEach(async function () {
      await fund.connect(investor1).deposit(ethers.parseUnits("1000", 6));
      await fund.connect(investor2).deposit(ethers.parseUnits("2000", 6));
    });
    
    it("Should allow manager to start trading", async function () {
      await fund.connect(manager).startTrading();
      expect(await fund.currentPhase()).to.equal(1);
    });
    
    it("Should transfer funds to agent wallet", async function () {
      const fundBalance = await usdc.balanceOf(await fund.getAddress());
      
      await fund.connect(manager).startTrading();
      
      const agentBalance = await usdc.balanceOf(agent.address);
      expect(agentBalance).to.equal(fundBalance);
    });
    
    it("Should only allow agent to return funds", async function () {
      await fund.connect(manager).startTrading();
      
      const returnAmount = ethers.parseUnits("3500", 6);
      await usdc.mint(agent.address, returnAmount);
      await usdc.connect(agent).approve(await fund.getAddress(), returnAmount);
      
      await fund.connect(agent).returnFunds(returnAmount);
      expect(await fund.currentPhase()).to.equal(2);
    });
  });
  
  describe("Redemption Phase", function () {
    beforeEach(async function () {
      await fund.connect(investor1).deposit(ethers.parseUnits("1000", 6));
      await fund.connect(investor2).deposit(ethers.parseUnits("2000", 6));
      await fund.connect(manager).startTrading();
      
      const returnAmount = ethers.parseUnits("3600", 6);
      await usdc.mint(agent.address, returnAmount);
      await usdc.connect(agent).approve(await fund.getAddress(), returnAmount);
      await fund.connect(agent).returnFunds(returnAmount);
    });
    
    it("Should calculate profit correctly", async function () {
      await fund.calculateProfit();
      
      const totalDeposits = await fund.totalDeposits();
      const finalValue = await usdc.balanceOf(await fund.getAddress());
      
      expect(await fund.profitCalculated()).to.be.true;
    });
    
    it("Should distribute carried interest to manager", async function () {
      const managerBalanceBefore = await usdc.balanceOf(manager.address);
      
      await fund.calculateProfit();
      
      const managerBalanceAfter = await usdc.balanceOf(manager.address);
      const carriedAmount = managerBalanceAfter - managerBalanceBefore;
      
      expect(carriedAmount).to.be.gt(0);
    });
    
    it("Should allow investors to withdraw proportionally", async function () {
      await fund.calculateProfit();
      
      const shares = await fund.balanceOf(investor1.address);
      const totalShares = await fund.totalSupply();
      const finalValue = await fund.finalFundValue();
      const expectedAmount = (finalValue * shares) / totalShares;
      
      const balanceBefore = await usdc.balanceOf(investor1.address);
      await fund.connect(investor1).withdraw();
      const balanceAfter = await usdc.balanceOf(investor1.address);
      
      expect(balanceAfter - balanceBefore).to.be.closeTo(expectedAmount, ethers.parseUnits("1", 6));
    });
  });
  
  describe("Emergency Functions", function () {
    it("Should allow manager to pause", async function () {
      await fund.connect(manager).emergencyPause();
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await expect(fund.connect(investor1).deposit(depositAmount))
        .to.be.revertedWithCustomError(fund, "EnforcedPause");
    });
    
    it("Should only allow owner to unpause", async function () {
      await fund.connect(manager).emergencyPause();
      
      await expect(fund.connect(manager).unpause())
        .to.be.revertedWithCustomError(fund, "OwnableUnauthorizedAccount");
      
      await fund.connect(owner).unpause();
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await fund.connect(investor1).deposit(depositAmount);
    });
  });
});


const MockERC20 = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
`;