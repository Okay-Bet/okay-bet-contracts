const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("FundFactory", function () {
  let factory;
  let usdc;
  let owner, manager, agent1, agent2, investor;
  
  beforeEach(async function () {
    [owner, manager, agent1, agent2, investor] = await ethers.getSigners();
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    
    const FundFactory = await ethers.getContractFactory("FundFactory");
    factory = await FundFactory.deploy(await usdc.getAddress());
  });
  
  describe("Deployment", function () {
    it("Should set the correct USDC address", async function () {
      expect(await factory.usdc()).to.equal(await usdc.getAddress());
    });
    
    it("Should set default protocol fee", async function () {
      expect(await factory.protocolFee()).to.equal(50);
    });
    
    it("Should set owner correctly", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });
  });
  
  describe("Agent Whitelisting", function () {
    it("Should whitelist single agent", async function () {
      await factory.whitelistAgent(agent1.address, true);
      expect(await factory.whitelistedAgents(agent1.address)).to.be.true;
    });
    
    it("Should batch whitelist agents", async function () {
      await factory.batchWhitelistAgents(
        [agent1.address, agent2.address],
        [true, true]
      );
      
      expect(await factory.whitelistedAgents(agent1.address)).to.be.true;
      expect(await factory.whitelistedAgents(agent2.address)).to.be.true;
    });
    
    it("Should only allow owner to whitelist", async function () {
      await expect(factory.connect(manager).whitelistAgent(agent1.address, true))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
    
    it("Should remove agent from whitelist", async function () {
      await factory.whitelistAgent(agent1.address, true);
      await factory.whitelistAgent(agent1.address, false);
      
      expect(await factory.whitelistedAgents(agent1.address)).to.be.false;
    });
  });
  
  describe("Fund Creation", function () {
    beforeEach(async function () {
      await factory.whitelistAgent(agent1.address, true);
    });
    
    it("Should create fund with valid parameters", async function () {
      const depositDeadline = (await time.latest()) + 86400;
      
      const tx = await factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return factory.interface.parseLog(log).name === "FundCreated";
        } catch { return false; }
      });
      
      expect(event).to.not.be.undefined;
      
      const funds = await factory.getAllFunds();
      expect(funds.length).to.equal(1);
    });
    
    it("Should reject non-whitelisted agent", async function () {
      const depositDeadline = (await time.latest()) + 86400;
      
      await expect(factory.connect(manager).createFund(
        "Test Fund",
        agent2.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      )).to.be.revertedWith("Agent not whitelisted");
    });
    
    it("Should validate target raise limits", async function () {
      const depositDeadline = (await time.latest()) + 86400;
      
      await expect(factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("500", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      )).to.be.revertedWith("Target raise too low");
      
      await expect(factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("11000000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      )).to.be.revertedWith("Target raise too high");
    });
    
    it("Should track funds by manager", async function () {
      const depositDeadline = (await time.latest()) + 86400;
      
      await factory.connect(manager).createFund(
        "Fund 1",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      );
      
      await factory.connect(manager).createFund(
        "Fund 2",
        agent1.address,
        ethers.parseUnits("20000", 6),
        14 * 24 * 60 * 60,
        300,
        2500,
        ethers.parseUnits("200", 6),
        depositDeadline + 86400
      );
      
      const managerFunds = await factory.getManagerFunds(manager.address);
      expect(managerFunds.length).to.equal(2);
    });
    
    it("Should track funds by agent", async function () {
      await factory.whitelistAgent(agent2.address, true);
      const depositDeadline = (await time.latest()) + 86400;
      
      await factory.connect(manager).createFund(
        "Fund 1",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      );
      
      await factory.connect(manager).createFund(
        "Fund 2",
        agent1.address,
        ethers.parseUnits("20000", 6),
        14 * 24 * 60 * 60,
        300,
        2500,
        ethers.parseUnits("200", 6),
        depositDeadline + 86400
      );
      
      const agentFunds = await factory.getAgentFunds(agent1.address);
      expect(agentFunds.length).to.equal(2);
    });
  });
  
  describe("Protocol Fee", function () {
    it("Should update protocol fee", async function () {
      await factory.setProtocolFee(75);
      expect(await factory.protocolFee()).to.equal(75);
    });
    
    it("Should reject excessive protocol fee", async function () {
      await expect(factory.setProtocolFee(101))
        .to.be.revertedWith("Fee too high");
    });
    
    it("Should only allow owner to update fee", async function () {
      await expect(factory.connect(manager).setProtocolFee(75))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Pause Mechanism", function () {
    beforeEach(async function () {
      await factory.whitelistAgent(agent1.address, true);
    });
    
    it("Should pause fund creation", async function () {
      await factory.pause();
      
      const depositDeadline = (await time.latest()) + 86400;
      
      await expect(factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      )).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });
    
    it("Should unpause fund creation", async function () {
      await factory.pause();
      await factory.unpause();
      
      const depositDeadline = (await time.latest()) + 86400;
      
      await factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      );
      
      const funds = await factory.getAllFunds();
      expect(funds.length).to.equal(1);
    });
  });
  
  describe("Fund Details", function () {
    let fundAddress;
    
    beforeEach(async function () {
      await factory.whitelistAgent(agent1.address, true);
      const depositDeadline = (await time.latest()) + 86400;
      
      const tx = await factory.connect(manager).createFund(
        "Test Fund",
        agent1.address,
        ethers.parseUnits("10000", 6),
        7 * 24 * 60 * 60,
        200,
        2000,
        ethers.parseUnits("100", 6),
        depositDeadline
      );
      
      const funds = await factory.getAllFunds();
      fundAddress = funds[0];
    });
    
    it("Should retrieve fund details", async function () {
      const details = await factory.getFundDetails(fundAddress);
      
      expect(details.fundName).to.equal("Test Fund");
      expect(details.agentWallet).to.equal(agent1.address);
      expect(details.fundManager).to.equal(manager.address);
      expect(details.targetRaise).to.equal(ethers.parseUnits("10000", 6));
      expect(details.currentPhase).to.equal(0);
    });
    
    it("Should count total funds", async function () {
      expect(await factory.getFundCount()).to.equal(1);
      
      const depositDeadline = (await time.latest()) + 86400;
      await factory.connect(manager).createFund(
        "Fund 2",
        agent1.address,
        ethers.parseUnits("20000", 6),
        14 * 24 * 60 * 60,
        300,
        2500,
        ethers.parseUnits("200", 6),
        depositDeadline + 86400
      );
      
      expect(await factory.getFundCount()).to.equal(2);
    });
  });
});