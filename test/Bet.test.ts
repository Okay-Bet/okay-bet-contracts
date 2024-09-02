import { expect } from "chai";
import { ethers } from "hardhat";
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
  const expirationBlocks = 50400; // 1 week

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
      wagerRatio,
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
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      // Fast forward time
      const secondsInAWeek = 7 * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [secondsInAWeek]);

      // Mine enough blocks to ensure we've passed the expiration block
      for (let i = 0; i < expirationBlocks + 1; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await expect(bet.checkExpiration()).to.emit(bet, "BetExpired");

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
      await expect(
        bet
          .connect(maker)
          .fundBet(totalWager.div(2), { value: totalWager.div(2) })
      )
        .to.emit(bet, "BetFunded")
        .withArgs(maker.address, totalWager.div(2));

      await expect(
        bet
          .connect(taker)
          .fundBet(totalWager.div(2), { value: totalWager.div(2) })
      )
        .to.emit(bet, "BetFunded")
        .withArgs(taker.address, totalWager.div(2))
        .to.emit(bet, "BetFullyFunded");

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
      await usdcToken.connect(maker).approve(bet.address, totalWager.div(2));
      await usdcToken.mint(mockBettorContract.address, totalWager.div(2));
      await mockBettorContract.approveBet(bet.address, totalWager.div(2));

      await bet.connect(maker).fundBet(totalWager.div(2));
      await mockBettorContract.fundBet(bet.address, totalWager.div(2));

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
      await expect(bet.connect(judge).resolveBet(maker.address))
        .to.emit(bet, "BetResolved")
        .withArgs(maker.address, totalWager);

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
      await expect(bet.connect(maker).cancelBet())
        .to.emit(bet, "BetCancelled")
        .withArgs(maker.address);
      
      // Deploy another new bet
      await deployBet(50, usdcToken.address);
      
      // Taker should be able to cancel
      await expect(bet.connect(taker).cancelBet())
        .to.emit(bet, "BetCancelled")
        .withArgs(taker.address);
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
  });
});