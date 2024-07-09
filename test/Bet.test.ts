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
});
