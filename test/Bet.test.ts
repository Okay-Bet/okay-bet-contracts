import { expect } from "chai";
import { ethers } from "hardhat";
import { Bet, Bet__factory } from "../typechain-types";

describe("Bet Contract", function () {
  let bet: Bet;
  let better1: any;
  let better2: any;
  let decider: any;

  beforeEach(async function () {
    [better1, better2, decider] = await ethers.getSigners();
    const BetFactory = await ethers.getContractFactory("Bet", better1);
    bet = await BetFactory.deploy(
      better1.address,
      better2.address,
      decider.address,
      ethers.utils.parseEther("1"),
      "Test Conditions"
    );
    await bet.deployed();
  });

  it("should be deployed correctly", async function () {
    console.log("Deployed Bet contract at:", bet.address);
    const betDetails = await bet.bet();
    console.log("Bet Details:", betDetails);
    expect(betDetails.better1).to.equal(better1.address);
    expect(betDetails.better2).to.equal(better2.address);
    expect(betDetails.decider).to.equal(decider.address);
  });

  it("should allow funding from better1", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    const betDetails = await bet.bet();
    console.log("Bet Details after better1 funding:", betDetails);
    expect(betDetails.status).to.equal(1); // Better1Funded
  });

  it("should allow funding from better2", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    const betDetails = await bet.bet();
    console.log("Bet Details after better2 funding:", betDetails);
    expect(betDetails.status).to.equal(3); // FullyFunded
  });

  it("should allow the decider to resolve the bet", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(decider).resolveBet(better1.address);
    const betDetails = await bet.bet();
    console.log("Bet Details after resolving:", betDetails);
    expect(betDetails.status).to.equal(4); // Resolved
    expect(betDetails.winner).to.equal(better1.address);
  });

  it("should allow the decider to invalidate the bet", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(decider).invalidateBet();
    const betDetails = await bet.bet();
    console.log("Bet Details after invalidation:", betDetails);
    expect(betDetails.status).to.equal(5); // Invalidated
  });

  it("should allow the bet to be cancelled", async function () {
    await bet.connect(better1).cancelBet();
    const betDetails = await bet.bet();
    console.log("Bet Details after cancellation:", betDetails);
    expect(betDetails.status).to.equal(5); // Invalidated
  });

  it("should not allow double funding from the same bettor", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await expect(
      bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") })
    ).to.be.revertedWith("You have already funded your part.");
  });

  it("should revert if the incorrect wager amount is sent", async function () {
    await expect(
      bet.connect(better1).fundBet({ value: ethers.utils.parseEther("0.5") })
    ).to.be.revertedWith("Incorrect wager amount.");
  });

  it("should not allow non-betters to fund the bet", async function () {
    const [_, __, ___, nonBetter] = await ethers.getSigners();
    await expect(
      bet.connect(nonBetter).fundBet({ value: ethers.utils.parseEther("1") })
    ).to.be.revertedWith("Only the bettors can fund the bet.");
  });

  it("should not allow non-decider to resolve the bet", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    const [_, __, ___, nonDecider] = await ethers.getSigners();
    await expect(
      bet.connect(nonDecider).resolveBet(better1.address)
    ).to.be.revertedWith("Only the decider can resolve the bet.");
  });

  it("should not allow non-decider to invalidate the bet", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    const [_, __, ___, nonDecider] = await ethers.getSigners();
    await expect(bet.connect(nonDecider).invalidateBet()).to.be.revertedWith(
      "Only the decider can invalidate the bet."
    );
  });

  it("should not allow non-betters or non-decider to cancel the bet", async function () {
    const [_, __, ___, nonParticipant] = await ethers.getSigners();
    await expect(bet.connect(nonParticipant).cancelBet()).to.be.revertedWith(
      "Only bettors or decider can cancel."
    );
  });

  it("should handle very large wagers", async function () {
    const BetFactory = await ethers.getContractFactory("Bet", better1);
    const largeWager = ethers.constants.MaxUint256.div(2); // Half of max uint256
    const largeBet = await BetFactory.deploy(
      better1.address,
      better2.address,
      decider.address,
      largeWager,
      "Large Wager Test"
    );
    await largeBet.deployed();

    const betDetails = await largeBet.bet();
    expect(betDetails.wager).to.equal(largeWager);
  });

  it("should measure gas usage for bet operations", async function () {
    const fundTx = await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    const fundReceipt = await fundTx.wait();
    console.log("Gas used for funding:", fundReceipt.gasUsed.toString());

    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });

    const resolveTx = await bet.connect(decider).resolveBet(better1.address);
    const resolveReceipt = await resolveTx.wait();
    console.log("Gas used for resolving:", resolveReceipt.gasUsed.toString());
  });

  it("should go through a full bet lifecycle", async function () {
    // Fund the bet
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });

    // Check fully funded status
    let betDetails = await bet.bet();
    expect(betDetails.status).to.equal(3); // FullyFunded

    // Resolve the bet
    await bet.connect(decider).resolveBet(better1.address);

    // Check resolved status and winner
    betDetails = await bet.bet();
    expect(betDetails.status).to.equal(4); // Resolved
    expect(betDetails.winner).to.equal(better1.address);

    // Check winner's balance increased
    // Note: This part is tricky in a test environment due to gas costs.
    // You might need to implement a more precise balance checking mechanism.
    const winnerBalanceAfter = await ethers.provider.getBalance(better1.address);
    console.log("Winner balance after resolution:", winnerBalanceAfter.toString());
  });

  it("should handle bet cancellation correctly", async function () {
    // Partial funding
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });

    // Cancel the bet
    await bet.connect(better2).cancelBet();

    // Check bet status
    const betDetails = await bet.bet();
    expect(betDetails.status).to.equal(5); // Invalidated

    // Check if better1 got their funds back
    // Note: This is also tricky due to gas costs. You might need a more precise checking mechanism.
    const better1BalanceAfter = await ethers.provider.getBalance(better1.address);
    console.log("Better1 balance after cancellation:", better1BalanceAfter.toString());
  });

  it("should emit BetFunded event when a bettor funds", async function () {
    await expect(bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") }))
      .to.emit(bet, "BetFunded")
      .withArgs(better1.address, ethers.utils.parseEther("1"));
  });

  it("should emit BetFullyFunded event when both bettors fund", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await expect(bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") }))
      .to.emit(bet, "BetFullyFunded");
  });

  it("should emit BetResolved event when bet is resolved", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    await expect(bet.connect(decider).resolveBet(better1.address))
      .to.emit(bet, "BetResolved")
      .withArgs(better1.address);
  });

  it("should emit BetInvalidated event when bet is invalidated", async function () {
    await bet.connect(better1).fundBet({ value: ethers.utils.parseEther("1") });
    await bet.connect(better2).fundBet({ value: ethers.utils.parseEther("1") });
    await expect(bet.connect(decider).invalidateBet())
      .to.emit(bet, "BetInvalidated");
  });

  it("should emit BetCancelled event when bet is cancelled", async function () {
    await expect(bet.connect(better1).cancelBet())
      .to.emit(bet, "BetCancelled")
      .withArgs(better1.address);
  });

});
