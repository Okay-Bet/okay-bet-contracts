import { expect } from "chai";
import { ethers } from "hardhat";
import { BetFactory, BetFactory__factory, Bet } from "../typechain-types";

describe("BetFactory Contract", function () {
  let betFactory: BetFactory;
  let better1: any;
  let better2: any;
  let decider: any;

  beforeEach(async function () {
    [better1, better2, decider] = await ethers.getSigners();
    const BetFactoryFactory = await ethers.getContractFactory("BetFactory", better1);
    betFactory = await BetFactoryFactory.deploy();
    await betFactory.deployed();
  });

  it("should create a new bet", async function () {
    const tx = await betFactory.createBet(
      better1.address,
      better2.address,
      decider.address,
      ethers.utils.parseEther("1"),
      "Test Conditions"
    );
    const receipt = await tx.wait();

    const betAddress = receipt.events?.find((event: any) => event.event === "BetCreated")?.args?.betAddress;
    console.log("Created Bet at:", betAddress);

    const BetContract = await ethers.getContractAt("Bet", betAddress);
    const betDetails = await BetContract.bet();
    console.log("Bet Details:", betDetails);

    expect(betDetails.better1).to.equal(better1.address);
    expect(betDetails.better2).to.equal(better2.address);
    expect(betDetails.decider).to.equal(decider.address);
    expect(betDetails.wager).to.equal(ethers.utils.parseEther("1"));
    expect(betDetails.conditions).to.equal("Test Conditions");
  });

  it("should return the correct number of bets", async function () {
    await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions");
    await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Another Test");

    const bets = await betFactory.getBets();
    console.log("Bets created:", bets);
    expect(bets.length).to.equal(2);
  });

  // New corner case tests

  it("should not create a bet with the same bettor addresses", async function () {
    await expect(
      betFactory.createBet(better1.address, better1.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions")
    ).to.be.revertedWith("Bettors must be different addresses");
  });

  it("should not create a bet with invalid addresses", async function () {
    await expect(
      betFactory.createBet(ethers.constants.AddressZero, better2.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions")
    ).to.be.revertedWith("Invalid address");

    await expect(
      betFactory.createBet(better1.address, ethers.constants.AddressZero, decider.address, ethers.utils.parseEther("1"), "Test Conditions")
    ).to.be.revertedWith("Invalid address");

    await expect(
      betFactory.createBet(better1.address, better2.address, ethers.constants.AddressZero, ethers.utils.parseEther("1"), "Test Conditions")
    ).to.be.revertedWith("Invalid address");
  });

  it("should not create a bet with a wager of 0", async function () {
    await expect(
      betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("0"), "Test Conditions")
    ).to.be.revertedWith("Wager must be greater than 0");
  });

  it("should correctly store and retrieve multiple bets", async function () {
    const tx1 = await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions");
    const receipt1 = await tx1.wait();
    const betAddress1 = receipt1.events?.find((event: any) => event.event === "BetCreated")?.args?.betAddress;

    const tx2 = await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Another Test Conditions");
    const receipt2 = await tx2.wait();
    const betAddress2 = receipt2.events?.find((event: any) => event.event === "BetCreated")?.args?.betAddress;

    const bets = await betFactory.getBets();
    console.log("Bets created:", bets);
    expect(bets.length).to.equal(2);
    expect(bets[0]).to.equal(betAddress1);
    expect(bets[1]).to.equal(betAddress2);

    const BetContract1 = await ethers.getContractAt("Bet", betAddress1);
    const betDetails1 = await BetContract1.bet();
    console.log("Bet 1 Details:", betDetails1);
    expect(betDetails1.conditions).to.equal("Test Conditions");

    const BetContract2 = await ethers.getContractAt("Bet", betAddress2);
    const betDetails2 = await BetContract2.bet();
    console.log("Bet 2 Details:", betDetails2);
    expect(betDetails2.conditions).to.equal("Another Test Conditions");
  });

  it("should emit the BetCreated event with correct arguments", async function () {
    const tx = await betFactory.createBet(
      better1.address,
      better2.address,
      decider.address,
      ethers.utils.parseEther("1"),
      "Test Conditions"
    );
    const receipt = await tx.wait();

    const event = receipt.events?.find((event: any) => event.event === "BetCreated");
    expect(event).to.not.be.undefined;
    expect(event.args.better1).to.equal(better1.address);
    expect(event.args.better2).to.equal(better2.address);
    expect(event.args.decider).to.equal(decider.address);
    expect(event.args.wager).to.equal(ethers.utils.parseEther("1"));
    expect(event.args.conditions).to.equal("Test Conditions");
  });
});