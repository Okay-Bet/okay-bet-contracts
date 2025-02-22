import { expect, anything } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  Bet,
  BetFactory,
  MockERC20,
  MockBettorContract,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Bet Contract", function () {
  let betFactory: BetFactory;
  let bet: Bet;
  let maker: SignerWithAddress;
  let taker: SignerWithAddress;
  let judge: SignerWithAddress;
  let usdcToken: MockERC20;
  let daiToken: MockERC20;
  const totalWager = ethers.utils.parseUnits("100", 6); // Assuming 6 decimals
  const expirationBlocks = 302400; // 1 week

  beforeEach(async function () {
    [maker, taker, judge] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
    await usdcToken.deployed();
    daiToken = await MockERC20Factory.deploy("Dai Stablecoin", "DAI", 18);
    await daiToken.deployed();

    // Deploy BetFactory
    const BetFactoryFactory = await ethers.getContractFactory("BetFactory");
    betFactory = await BetFactoryFactory.deploy();
    await betFactory.deployed();

    // Mint tokens to maker and taker
    await usdcToken.mint(maker.address, totalWager);
    await usdcToken.mint(taker.address, totalWager);
    await daiToken.mint(maker.address, totalWager);
    await daiToken.mint(taker.address, totalWager);
  });

  async function deployBet(
    wagerRatio: number,
    wagerCurrency: string,
    takerAddress?: string
  ) {
    const tx = await betFactory.createBet(
      maker.address,
      takerAddress || taker.address, // Use provided taker address or default to taker
      judge.address,
      totalWager,
      wagerRatio * 100,
      "Test Conditions",
      expirationBlocks,
      wagerCurrency
    );
    const receipt = await tx.wait();
    const betAddress = receipt.events?.find((e) => e.event === "BetCreated")
      ?.args?.betAddress;
    bet = await ethers.getContractAt("Bet", betAddress);
  }

  describe("Bet with regular addresses", function () {
    beforeEach(async function () {
      await deployBet(50, usdcToken.address); // 50-50 split with USDC
    });

    it("should be deployed with correct initial state", async function () {
      const betDetails = await bet.bet();
      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.totalWager).to.equal(totalWager);
      expect(betDetails.wagerRatio).to.equal(5000); // 50% * 100 for new precision
      expect(betDetails.conditions).to.equal("Test Conditions");
      expect(betDetails.status).to.equal(0); // Unfunded
    });

    it("should allow funding the bet", async function () {
      const makerWager = totalWager.div(2);
      const takerWager = totalWager.div(2);

      await usdcToken.connect(maker).approve(bet.address, makerWager);
      await usdcToken.connect(taker).approve(bet.address, takerWager);

      await expect(bet.connect(maker).fundBet())
        .to.emit(bet, "BetFunded")
        .withArgs(bet.address, maker.address, makerWager, 1); // 1 is for PartiallyFunded status

      const fundTakerTx = await bet.connect(taker).fundBet();
      const receipt = await fundTakerTx.wait();

      // Check for BetFunded event
      const betFundedEvent = receipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(betFundedEvent).to.not.be.undefined;
      if (betFundedEvent) {
        expect(betFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(betFundedEvent.args?.funder).to.equal(taker.address);
        expect(betFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(betFundedEvent.args?.newStatus).to.equal(2);
      }

      // Check for BetStatusChanged event
      const betStatusChangedEvent = receipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(betStatusChangedEvent).to.not.be.undefined;
      if (betStatusChangedEvent) {
        expect(betStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(betStatusChangedEvent.args?.oldStatus).to.equal(1);
        expect(betStatusChangedEvent.args?.newStatus).to.equal(2);
        expect(betStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );

        // Convert BigNumber to number and check if it's a valid timestamp
        const timestamp = (
          betStatusChangedEvent.args?.timestamp as BigNumber
        ).toNumber();
        expect(timestamp).to.be.a("number");
        expect(timestamp).to.be.greaterThan(0);
        expect(timestamp).to.be.lessThan(Date.now() / 1000 + 1000); // Allow some future tolerance
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });

    it("should allow the judge to resolve the bet", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet();
      await bet.connect(taker).fundBet();

      await expect(bet.connect(judge).resolveBet(maker.address))
        .to.emit(bet, "BetResolved")
        .withArgs(bet.address, maker.address, totalWager, anything);

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(3); // Resolved
      expect(betDetails.winner).to.equal(maker.address);
    });

        // Convert BigNumber to number and check if it's a valid timestamp
        const timestamp = (
          betResolvedEvent.args?.resolutionTimestamp as BigNumber
        ).toNumber();
        expect(timestamp).to.be.a("number");
        expect(timestamp).to.be.greaterThan(0);
        expect(timestamp).to.be.lessThan(Date.now() / 1000 + 1000); // Allow some future tolerance
      }

      // Check for BetStatusChanged event
      const betStatusChangedEvent = receipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(betStatusChangedEvent).to.not.be.undefined;
      if (betStatusChangedEvent) {
        expect(betStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(betStatusChangedEvent.args?.oldStatus).to.equal(2); // FullyFunded
        expect(betStatusChangedEvent.args?.newStatus).to.equal(3); // Resolved
        expect(betStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(3); // Resolved
      expect(betDetails.winner).to.equal(maker.address);
    });

    it("should allow cancelling an unfunded bet", async function () {
      const cancelTx = await bet.connect(maker).cancelBet();
      const receipt = await cancelTx.wait();

      // Check for BetInvalidated event
      const betInvalidatedEvent = receipt.events?.find(
        (e) => e.event === "BetInvalidated"
      );
      expect(betInvalidatedEvent).to.not.be.undefined;
      if (betInvalidatedEvent) {
        expect(betInvalidatedEvent.args?.betAddress).to.equal(bet.address);
        expect(betInvalidatedEvent.args?.invalidator).to.equal(maker.address);
        expect(betInvalidatedEvent.args?.reason).to.equal("Bet cancelled");
        expect(
          betInvalidatedEvent.args?.invalidationTimestamp
        ).to.be.instanceOf(BigNumber);

        // Convert BigNumber to number and check if it's a valid timestamp
        const timestamp = (
          betInvalidatedEvent.args?.invalidationTimestamp as BigNumber
        ).toNumber();
        expect(timestamp).to.be.a("number");
        expect(timestamp).to.be.greaterThan(0);
        expect(timestamp).to.be.lessThan(Date.now() / 1000 + 1000); // Allow some future tolerance
      }

      // Check for BetStatusChanged event
      const betStatusChangedEvent = receipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(betStatusChangedEvent).to.not.be.undefined;
      if (betStatusChangedEvent) {
        expect(betStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(betStatusChangedEvent.args?.oldStatus).to.equal(0); // Unfunded
        expect(betStatusChangedEvent.args?.newStatus).to.equal(4); // Invalidated
        expect(betStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should allow the judge to invalidate a fully funded bet", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      await expect(bet.connect(judge).invalidateBet()).to.emit(
        bet,
        "BetInvalidated"
      );

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should handle bet expiration", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));

      // Fund the bet with maker
      const fundMakerTx = await bet.connect(maker).fundBet(totalWager.div(2));
      const makerReceipt = await fundMakerTx.wait();

      const makerFundedEvent = makerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(makerFundedEvent).to.not.be.undefined;
      if (makerFundedEvent) {
        expect(makerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(makerFundedEvent.args?.funder).to.equal(maker.address);
        expect(makerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(makerFundedEvent.args?.newStatus).to.equal(1); // PartiallyFunded
      }

      // Fund the bet with taker
      const fundTakerTx = await bet.connect(taker).fundBet(totalWager.div(2));
      const takerReceipt = await fundTakerTx.wait();

      const takerFundedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(takerFundedEvent).to.not.be.undefined;
      if (takerFundedEvent) {
        expect(takerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(takerFundedEvent.args?.funder).to.equal(taker.address);
        expect(takerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(takerFundedEvent.args?.newStatus).to.equal(2); // FullyFunded
      }

      const statusChangedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(statusChangedEvent).to.not.be.undefined;
      if (statusChangedEvent) {
        expect(statusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(statusChangedEvent.args?.oldStatus).to.equal(1); // PartiallyFunded
        expect(statusChangedEvent.args?.newStatus).to.equal(2); // FullyFunded
        expect(statusChangedEvent.args?.timestamp).to.be.instanceOf(BigNumber);
      }

      // Fast forward time
      const secondsInAWeek = 7 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [secondsInAWeek]);

      // Mine enough blocks to ensure we've passed the expiration block
      for (let i = 0; i < expirationBlocks + 1; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const expirationTx = await bet.checkExpiration();
      const expirationReceipt = await expirationTx.wait();

      const betInvalidatedEvent = expirationReceipt.events?.find(
        (e) => e.event === "BetInvalidated"
      );
      expect(betInvalidatedEvent).to.not.be.undefined;
      if (betInvalidatedEvent) {
        expect(betInvalidatedEvent.args?.betAddress).to.equal(bet.address);
        expect(betInvalidatedEvent.args?.invalidator).to.equal(bet.address);
        expect(betInvalidatedEvent.args?.reason).to.equal("Bet expired");
        expect(
          betInvalidatedEvent.args?.invalidationTimestamp
        ).to.be.instanceOf(BigNumber);
      }

      const finalStatusChangedEvent = expirationReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(finalStatusChangedEvent).to.not.be.undefined;
      if (finalStatusChangedEvent) {
        expect(finalStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(finalStatusChangedEvent.args?.oldStatus).to.equal(2); // FullyFunded
        expect(finalStatusChangedEvent.args?.newStatus).to.equal(5); // Expired
        expect(finalStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }

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

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(
        totalWager.div(2)
      );
      expect(takerBalanceAfter.sub(takerBalanceBefore)).to.equal(
        totalWager.div(2)
      );
    });

    it("should return funds to bettors when cancelled", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);

      await bet.connect(maker).cancelBet();

      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(
        totalWager.div(2)
      );
    });
  });

  describe("Bet with ETH", function () {
    beforeEach(async function () {
      await deployBet(50, ethers.constants.AddressZero); // 50-50 split with ETH
    });

    it("should allow funding the bet with ETH", async function () {
      const makerWager = totalWager.div(2);
      const takerWager = totalWager.div(2);

      // Fund the bet with maker
      const fundMakerTx = await bet
        .connect(maker)
        .fundBet({ value: makerWager });
      const makerReceipt = await fundMakerTx.wait();

      const makerFundedEvent = makerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(makerFundedEvent).to.not.be.undefined;
      if (makerFundedEvent) {
        expect(makerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(makerFundedEvent.args?.funder).to.equal(maker.address);
        expect(makerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(makerFundedEvent.args?.newStatus).to.equal(1); // PartiallyFunded
      }

      // Fund the bet with taker
      const fundTakerTx = await bet
        .connect(taker)
        .fundBet(totalWager.div(2), { value: totalWager.div(2) });
      const takerReceipt = await fundTakerTx.wait();

      const takerFundedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(takerFundedEvent).to.not.be.undefined;
      if (takerFundedEvent) {
        expect(takerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(takerFundedEvent.args?.funder).to.equal(taker.address);
        expect(takerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(takerFundedEvent.args?.newStatus).to.equal(2); // FullyFunded
      }

      const statusChangedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(statusChangedEvent).to.not.be.undefined;
      if (statusChangedEvent) {
        expect(statusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(statusChangedEvent.args?.oldStatus).to.equal(1); // PartiallyFunded
        expect(statusChangedEvent.args?.newStatus).to.equal(2); // FullyFunded
        expect(statusChangedEvent.args?.timestamp).to.be.instanceOf(BigNumber);
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });
  });

  describe("Bet with DAI", function () {
    beforeEach(async function () {
      await deployBet(50, daiToken.address); // 50-50 split with DAI
    });

    it("should allow funding the bet with DAI", async function () {
      await daiToken.connect(maker).approve(bet.address, totalWager.div(2));
      await daiToken.connect(taker).approve(bet.address, totalWager.div(2));

      // Fund the bet with maker
      const fundMakerTx = await bet.connect(maker).fundBet(totalWager.div(2));
      const makerReceipt = await fundMakerTx.wait();

      const makerFundedEvent = makerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(makerFundedEvent).to.not.be.undefined;
      if (makerFundedEvent) {
        expect(makerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(makerFundedEvent.args?.funder).to.equal(maker.address);
        expect(makerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(makerFundedEvent.args?.newStatus).to.equal(1); // PartiallyFunded
      }

      // Fund the bet with taker
      const fundTakerTx = await bet.connect(taker).fundBet(totalWager.div(2));
      const takerReceipt = await fundTakerTx.wait();

      const takerFundedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetFunded"
      );
      expect(takerFundedEvent).to.not.be.undefined;
      if (takerFundedEvent) {
        expect(takerFundedEvent.args?.betAddress).to.equal(bet.address);
        expect(takerFundedEvent.args?.funder).to.equal(taker.address);
        expect(takerFundedEvent.args?.amount).to.equal(totalWager.div(2));
        expect(takerFundedEvent.args?.newStatus).to.equal(2); // FullyFunded
      }

      const statusChangedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(statusChangedEvent).to.not.be.undefined;
      if (statusChangedEvent) {
        expect(statusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(statusChangedEvent.args?.oldStatus).to.equal(1); // PartiallyFunded
        expect(statusChangedEvent.args?.newStatus).to.equal(2); // FullyFunded
        expect(statusChangedEvent.args?.timestamp).to.be.instanceOf(BigNumber);
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });
  });

  describe("Bet with smart contract as taker", function () {
    let mockBettorContract: MockBettorContract;

    beforeEach(async function () {
      const MockBettorContractFactory = await ethers.getContractFactory(
        "MockBettorContract"
      );
      mockBettorContract = await MockBettorContractFactory.deploy(
        usdcToken.address
      );
      await mockBettorContract.deployed();

      // Deploy the bet with mockBettorContract as the taker
      await deployBet(50, usdcToken.address, mockBettorContract.address);
    });

    it("should allow a smart contract to be a bettor", async function () {
      const makerWager = totalWager.div(2);
      const takerWager = totalWager.div(2);

      await usdcToken.connect(maker).approve(bet.address, makerWager);
      await usdcToken.mint(mockBettorContract.address, takerWager);
      await mockBettorContract.approveBet(bet.address, takerWager);

      await bet.connect(maker).fundBet();
      await mockBettorContract.fundBet(bet.address);

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(2); // FullyFunded
    });

    it("should correctly resolve bet with smart contract taker", async function () {
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.mint(mockBettorContract.address, totalWager.div(2));
      await mockBettorContract.approveBet(bet.address, totalWager.div(2));

      await bet.connect(maker).fundBet(totalWager.div(2));
      await mockBettorContract.fundBet(bet.address, totalWager.div(2));

      const contractBalanceBefore = await usdcToken.balanceOf(
        mockBettorContract.address
      );

      await bet.connect(judge).resolveBet(mockBettorContract.address);

      const contractBalanceAfter = await usdcToken.balanceOf(
        mockBettorContract.address
      );

      expect(contractBalanceAfter.sub(contractBalanceBefore)).to.equal(
        totalWager
      );
    });
  });

  describe("Bet with uneven odds", function () {
    beforeEach(async function () {
      await deployBet(75, usdcToken.address); // 75-25 split with USDC
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

  describe("Bet with extreme wager ratios", function () {
    it("should handle bet with 0 wager ratio (taker takes all risk)", async function () {
      await deployBet(0, usdcToken.address); // 0-100 split

      const betDetails = await bet.bet();
      expect(betDetails.wagerRatio).to.equal(0);

      await usdcToken.connect(taker).approve(bet.address, totalWager);
      await bet.connect(taker).fundBet(totalWager);

      const betDetailsAfterFunding = await bet.bet();
      expect(betDetailsAfterFunding.status).to.equal(2); // FullyFunded

      // Resolve bet in favor of taker
      const takerBalanceBefore = await usdcToken.balanceOf(taker.address);
      await bet.connect(judge).resolveBet(taker.address);
      const takerBalanceAfter = await usdcToken.balanceOf(taker.address);

      expect(takerBalanceAfter.sub(takerBalanceBefore)).to.equal(totalWager);

      // Check that maker didn't need to fund anything
      const makerFundedAmount = await bet.fundedAmount(maker.address);
      expect(makerFundedAmount).to.equal(0);
    });

    it("should handle bet with 100 wager ratio (maker takes all risk)", async function () {
      await deployBet(100, usdcToken.address); // 100-0 split

      const betDetails = await bet.bet();
      expect(betDetails.wagerRatio).to.equal(100);

      await usdcToken.connect(maker).approve(bet.address, totalWager);
      await bet.connect(maker).fundBet(totalWager);

      const betDetailsAfterFunding = await bet.bet();
      expect(betDetailsAfterFunding.status).to.equal(2); // FullyFunded

      // Resolve bet in favor of maker
      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);
      await bet.connect(judge).resolveBet(maker.address);
      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager);

      // Check that taker didn't need to fund anything
      const takerFundedAmount = await bet.fundedAmount(taker.address);
      expect(takerFundedAmount).to.equal(0);
    });

    it("should correctly handle cancellation with 0 wager ratio", async function () {
      await deployBet(0, usdcToken.address); // 0-100 split

      await usdcToken.connect(taker).approve(bet.address, totalWager);
      await bet.connect(taker).fundBet(totalWager);

      const takerBalanceBefore = await usdcToken.balanceOf(taker.address);
      await bet.connect(judge).invalidateBet();
      const takerBalanceAfter = await usdcToken.balanceOf(taker.address);

      expect(takerBalanceAfter.sub(takerBalanceBefore)).to.equal(totalWager);
    });

    it("should correctly handle cancellation with 100 wager ratio", async function () {
      await deployBet(100, usdcToken.address); // 100-0 split

      await usdcToken.connect(maker).approve(bet.address, totalWager);
      await bet.connect(maker).fundBet(totalWager);

      const makerBalanceBefore = await usdcToken.balanceOf(maker.address);
      await bet.connect(judge).invalidateBet();
      const makerBalanceAfter = await usdcToken.balanceOf(maker.address);

      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager);
    });

    it("should not allow taker to fund when wager ratio is 100", async function () {
      await deployBet(100, usdcToken.address); // 100-0 split

      await usdcToken.connect(taker).approve(bet.address, totalWager);
      await expect(bet.connect(taker).fundBet(totalWager)).to.be.revertedWith(
        "Overfunding not allowed."
      );
    });

    it("should not allow maker to fund when wager ratio is 0", async function () {
      await deployBet(0, usdcToken.address); // 0-100 split

      await usdcToken.connect(maker).approve(bet.address, totalWager);
      await expect(bet.connect(maker).fundBet(totalWager)).to.be.revertedWith(
        "Overfunding not allowed."
      );
    });
  });

  describe("Bet finalization", function () {
    beforeEach(async function () {
      await deployBet(50, usdcToken.address); // 50-50 split with USDC
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.connect(taker).approve(bet.address, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));
    });

    it("should finalize bet when resolved", async function () {
      const resolveTx = await bet.connect(judge).resolveBet(maker.address);
      const receipt = await resolveTx.wait();

      // Check for BetResolved event
      const betResolvedEvent = receipt.events?.find(
        (e) => e.event === "BetResolved"
      );
      expect(betResolvedEvent).to.not.be.undefined;
      if (betResolvedEvent) {
        expect(betResolvedEvent.args?.betAddress).to.equal(bet.address);
        expect(betResolvedEvent.args?.winner).to.equal(maker.address);
        expect(betResolvedEvent.args?.winningAmount).to.equal(totalWager);
        expect(betResolvedEvent.args?.resolutionTimestamp).to.be.instanceOf(
          BigNumber
        );
      }

      // Check for BetStatusChanged event
      const betStatusChangedEvent = receipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(betStatusChangedEvent).to.not.be.undefined;
      if (betStatusChangedEvent) {
        expect(betStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(betStatusChangedEvent.args?.oldStatus).to.equal(2); // FullyFunded
        expect(betStatusChangedEvent.args?.newStatus).to.equal(3); // Resolved
        expect(betStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }

      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(3); // Resolved
      expect(betDetails.winner).to.equal(maker.address);
    });

    it("should finalize bet when invalidated", async function () {
      await bet.connect(judge).invalidateBet();
      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should allow maker or taker to cancel before fully funded", async function () {
      // Deploy a new bet without funding it
      await deployBet(50, usdcToken.address);

      // Maker should be able to cancel
      const makerCancelTx = await bet.connect(maker).cancelBet();
      const makerReceipt = await makerCancelTx.wait();

      const makerInvalidatedEvent = makerReceipt.events?.find(
        (e) => e.event === "BetInvalidated"
      );
      expect(makerInvalidatedEvent).to.not.be.undefined;
      if (makerInvalidatedEvent) {
        expect(makerInvalidatedEvent.args?.betAddress).to.equal(bet.address);
        expect(makerInvalidatedEvent.args?.invalidator).to.equal(maker.address);
        expect(makerInvalidatedEvent.args?.reason).to.equal("Bet cancelled");
        expect(
          makerInvalidatedEvent.args?.invalidationTimestamp
        ).to.be.instanceOf(BigNumber);
      }

      const makerStatusChangedEvent = makerReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(makerStatusChangedEvent).to.not.be.undefined;
      if (makerStatusChangedEvent) {
        expect(makerStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(makerStatusChangedEvent.args?.oldStatus).to.equal(0); // Unfunded
        expect(makerStatusChangedEvent.args?.newStatus).to.equal(4); // Invalidated
        expect(makerStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }

      // Deploy another new bet
      await deployBet(50, usdcToken.address);

      // Taker should be able to cancel
      const takerCancelTx = await bet.connect(taker).cancelBet();
      const takerReceipt = await takerCancelTx.wait();

      const takerInvalidatedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetInvalidated"
      );
      expect(takerInvalidatedEvent).to.not.be.undefined;
      if (takerInvalidatedEvent) {
        expect(takerInvalidatedEvent.args?.betAddress).to.equal(bet.address);
        expect(takerInvalidatedEvent.args?.invalidator).to.equal(taker.address);
        expect(takerInvalidatedEvent.args?.reason).to.equal("Bet cancelled");
        expect(
          takerInvalidatedEvent.args?.invalidationTimestamp
        ).to.be.instanceOf(BigNumber);
      }

      const takerStatusChangedEvent = takerReceipt.events?.find(
        (e) => e.event === "BetStatusChanged"
      );
      expect(takerStatusChangedEvent).to.not.be.undefined;
      if (takerStatusChangedEvent) {
        expect(takerStatusChangedEvent.args?.betAddress).to.equal(bet.address);
        expect(takerStatusChangedEvent.args?.oldStatus).to.equal(0); // Unfunded
        expect(takerStatusChangedEvent.args?.newStatus).to.equal(4); // Invalidated
        expect(takerStatusChangedEvent.args?.timestamp).to.be.instanceOf(
          BigNumber
        );
      }
    });

    it("should finalize bet when cancelled", async function () {
      await bet.connect(judge).cancelBet();
      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(4); // Invalidated
    });

    it("should finalize bet when expired", async function () {
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
      // Mine enough blocks to ensure we've passed the expiration block
      for (let i = 0; i < expirationBlocks + 1; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      await bet.checkExpiration();
      const betDetails = await bet.bet();
      expect(betDetails.status).to.equal(5); // Expired
    });

    it("should reject funds after finalization", async function () {
      await bet.connect(judge).resolveBet(maker.address);
      await expect(
        bet.connect(maker).fundBet(totalWager.div(2))
      ).to.be.revertedWith("Bet has been finalized");
    });

    it("should allow viewing results after finalization", async function () {
      await bet.connect(judge).resolveBet(maker.address);
      expect(await bet.getBetWinner()).to.equal(maker.address);
      expect(await bet.getBetStatus()).to.equal(3); // Resolved status

      const betDetails = await bet.getBetDetails();
      expect(betDetails.winner).to.equal(maker.address);
      expect(betDetails.status).to.equal(3); // Resolved status
      expect(betDetails.finalized).to.be.true;
    });

    it("should not allow resolving bet after finalization", async function () {
      await bet.connect(judge).resolveBet(maker.address);
      await expect(
        bet.connect(judge).resolveBet(taker.address)
      ).to.be.revertedWith("Bet has been finalized");
    });

    it("should not allow cancelling bet after finalization", async function () {
      await bet.connect(judge).resolveBet(maker.address);
      await expect(bet.connect(judge).cancelBet()).to.be.revertedWith(
        "Bet has been finalized"
      );
    });

    it("should not allow invalidating bet after finalization", async function () {
      await bet.connect(judge).resolveBet(maker.address);
      await expect(bet.connect(judge).invalidateBet()).to.be.revertedWith(
        "Bet has been finalized"
      );
    });

    describe("Bet with precise wager ratios", function () {
      it("should handle a 75.25% to 24.75% split", async function () {
        await deployBet(75.25, usdcToken.address);

        const makerWager = totalWager.mul(7525).div(10000);
        const takerWager = totalWager.mul(2475).div(10000);

        await usdcToken.connect(maker).approve(bet.address, makerWager);
        await usdcToken.connect(taker).approve(bet.address, takerWager);

        await bet.connect(maker).fundBet();
        await bet.connect(taker).fundBet();

        const betDetails = await bet.bet();
        expect(betDetails.status).to.equal(2); // FullyFunded

        await bet.connect(judge).resolveBet(maker.address);

        const makerBalanceAfter = await usdcToken.balanceOf(maker.address);
        expect(makerBalanceAfter).to.equal(totalWager);
      });
    });
  });
});
