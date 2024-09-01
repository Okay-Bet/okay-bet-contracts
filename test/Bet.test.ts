import { expect } from "chai";
import { ethers } from "hardhat";
import { Bet, Bet__factory, MockERC20, MockBettorContract } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Bet Contract", function () {
  let bet: Bet;
  let maker: SignerWithAddress;
  let taker: SignerWithAddress;
  let judge: SignerWithAddress;
  let usdcToken: MockERC20;
  let mockBettorContract: MockBettorContract;
  const totalWager = ethers.utils.parseUnits("100", 6); // Assuming USDC has 6 decimals
  const expirationBlocks = 50400; // 1 week

  beforeEach(async function () {
    [maker, taker, judge] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
    await usdcToken.deployed();

    // Deploy mock bettor contract
    const MockBettorContractFactory = await ethers.getContractFactory("MockBettorContract");
    mockBettorContract = await MockBettorContractFactory.deploy(usdcToken.address);
    await mockBettorContract.deployed();

    // Mint USDC to maker, taker, and mock bettor contract
    await usdcToken.mint(maker.address, totalWager);
    await usdcToken.mint(taker.address, totalWager);
    await usdcToken.mint(mockBettorContract.address, totalWager);
  });

  async function deployBet(wagerRatio: number) {
    const BetFactory = await ethers.getContractFactory("Bet");
    bet = await BetFactory.deploy(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      "Test Conditions",
      usdcToken.address,
      expirationBlocks
    );
    await bet.deployed();
  }

  describe("Bet with regular addresses", function () {
    beforeEach(async function () {
      await deployBet(50); // 50-50 split
    });

    it("should be deployed with correct initial state", async function () {
      const betDetails = await bet.bet();
      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.totalWager).to.equal(totalWager);
      expect(betDetails.wagerRatio).to.equal(50);
      expect(betDetails.conditions).to.equal("Test Conditions");
      expect(betDetails.status).to.equal(0); // Unfunded
    });

    it("should allow funding the bet", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));

      await expect(bet.connect(maker).fundBet(totalWager.div(2)))
        .to.emit(bet, "BetFunded")
        .withArgs(maker.address, totalWager.div(2));

      await expect(bet.connect(taker).fundBet(totalWager.div(2)))
        .to.emit(bet, "BetFunded")
        .withArgs(taker.address, totalWager.div(2))
        .to.emit(bet, "BetFullyFunded");

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });

    it("should allow the judge to resolve the bet", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      await expect(bet.connect(judge).resolveBet(maker.address))
        .to.emit(bet, "BetResolved")
        .withArgs(maker.address, totalWager);

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(3); // Resolved
      expect(betDetails.winner).to.equal(maker.address);
    });

    it("should allow cancelling an unfunded bet", async function () {
      await expect(bet.connect(maker).cancelBet())
        .to.emit(bet, "BetCancelled")
        .withArgs(maker.address);

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should allow the judge to invalidate a fully funded bet", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      await expect(bet.connect(judge).invalidateBet())
        .to.emit(bet, "BetInvalidated");

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should handle bet expiration", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      // Fast forward time
      const secondsInAWeek = 7 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [secondsInAWeek]);

      // Mine enough blocks to ensure we've passed the expiration block
      for (let i = 0; i < expirationBlocks + 1; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await expect(bet.checkExpiration())
        .to.emit(bet, "BetExpired");

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(5); // Expired
    });

    it("should return funds to bettors when invalidated", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);
      const takerBalanceBefore = await usdcToken.balanceOf(taker.address);

      await bet.connect(judge).invalidateBet();

      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);
      const takerBalanceAfter = await usdcToken.balanceOf(taker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager.div(2));
      expect(takerBalanceAfter.sub(takerBalanceBefore)).to.equal(totalWager.div(2));
    });

    it("should return funds to bettors when cancelled", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);

      await bet.connect(maker).cancelBet();

      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager.div(2));
    });
  });

  describe("Bet with smart contract as taker", function () {
    beforeEach(async function () {
      const BetFactory = await ethers.getContractFactory("Bet");
      bet = await BetFactory.deploy(
        maker.address,
        mockBettorContract.address,
        judge.address,
        totalWager,
        50,
        "Test Conditions",
        usdcToken.address,
        expirationBlocks
      );
      await bet.deployed();
    });

    it("should allow a smart contract to be a bettor", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await mockBettorContract.approveBet(bet.address, totalWager.div(2));

      await bet.connect(maker).fundBet(totalWager.div(2));
      await mockBettorContract.fundBet(bet.address, totalWager.div(2));

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });

    it("should correctly resolve bet with smart contract taker", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await mockBettorContract.approveBet(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await mockBettorContract.fundBet(bet.address, totalWager.div(2));

      const contractBalanceBefore = await usdcToken.balanceOf(mockBettorContract.address);

      await bet.connect(judge).resolveBet(mockBettorContract.address);

      const contractBalanceAfter = await usdcToken.balanceOf(mockBettorContract.address);

      expect(contractBalanceAfter.sub(contractBalanceBefore)).to.equal(totalWager);
    });
  });

  describe("Bet with uneven odds", function () {
    beforeEach(async function () {
      await deployBet(75); // 75-25 split
    });

    it("should allow funding with correct amounts for uneven odds", async function () {
      const makerWager = totalWager.mul(75).div(100);
      const takerWager = totalWager.mul(25).div(100);

      await usdcToken.connect(maker).approve(bet.address, makerWager);
      await usdcToken.connect(taker).approve(bet.address, takerWager);

      await bet.connect(maker).fundBet(makerWager);
      await bet.connect(taker).fundBet(takerWager);

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });

    it("should correctly resolve bet with uneven odds", async function () {
      const makerWager = totalWager.mul(75).div(100);
      const takerWager = totalWager.mul(25).div(100);

      await usdcToken.connect(maker).approve(bet.address, makerWager);
      await usdcToken.connect(taker).approve(bet.address, takerWager);
      await bet.connect(maker).fundBet(makerWager);
      await bet.connect(taker).fundBet(takerWager);

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);

      await bet.connect(judge).resolveBet(maker.address);

      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager);
    });

    it("should return correct amounts when invalidated with uneven odds", async function () {
      const makerWager = totalWager.mul(75).div(100);
      const takerWager = totalWager.mul(25).div(100);

      await usdcToken.connect(maker).approve(bet.address, makerWager);
      await usdcToken.connect(taker).approve(bet.address, takerWager);
      await bet.connect(maker).fundBet(makerWager);
      await bet.connect(taker).fundBet(takerWager);

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);
      const takerBalanceBefore = await usdcToken.balanceOf(taker.address);

      await bet.connect(judge).invalidateBet();

      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);
      const takerBalanceAfter = await usdcToken.balanceOf(taker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(makerWager);
      expect(takerBalanceAfter.sub(takerBalanceBefore)).to.equal(takerWager);
    });
  });
});