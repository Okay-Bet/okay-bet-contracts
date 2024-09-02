import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BetFactory,
  BetFactory__factory,
  Bet__factory,
  MockERC20,
} from "../typechain-types";

describe("BetFactory Contract", function () {
  let betFactory: BetFactory;
  let maker: any;
  let taker: any;
  let judge: any;
  let usdcToken: MockERC20;
  const totalWager = ethers.utils.parseUnits("100", 6); // Assuming USDC has 6 decimals
  const wagerRatio = 50; // Equal split
  const expirationBlocks = 302401; // 1 week

  beforeEach(async function () {
    [maker, taker, judge] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
    await usdcToken.deployed();

    // Mint USDC tokens to maker and taker
    await usdcToken.mint(maker.address, totalWager.div(2));
    await usdcToken.mint(taker.address, totalWager.div(2));

    // Deploy BetFactory
    const BetFactoryFactory = await ethers.getContractFactory("BetFactory");
    betFactory = await BetFactoryFactory.deploy();
    await betFactory.deployed();
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
    const bet = await ethers.getContractAt("Bet", betAddress);
    return bet;
  }

  it("should create a new bet", async function () {
    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      "Test Conditions",
      expirationBlocks,
      usdcToken.address
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");
    expect(event).to.not.be.undefined;
    const betAddress = event?.args?.betAddress;

    const bet = Bet__factory.connect(betAddress, maker);
    const betDetails = await bet.bet();

    expect(betDetails.maker).to.equal(maker.address);
    expect(betDetails.taker).to.equal(taker.address);
    expect(betDetails.judge).to.equal(judge.address);
    expect(betDetails.totalWager).to.equal(totalWager);
    expect(betDetails.wagerRatio).to.equal(wagerRatio);
  });

  it("should not allow creating a bet with invalid parameters", async function () {
    await expect(
      betFactory.createBet(
        maker.address,
        maker.address, // Same as maker
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        expirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid addresses");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        0, // Invalid total wager
        wagerRatio,
        "Test Conditions",
        expirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        101, // Invalid wager ratio
        "Test Conditions",
        expirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        0, // Invalid expiration blocks
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");
  });

  it("should create multiple bets", async function () {
    const tx1 = await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      "Test Conditions 1",
      expirationBlocks,
      usdcToken.address
    );
    const receipt1 = await tx1.wait();
    const betAddress1 = receipt1.events?.find((e) => e.event === "BetCreated")
      ?.args?.betAddress;

    const tx2 = await betFactory.createBet(
      taker.address,
      maker.address,
      judge.address,
      totalWager.mul(2),
      wagerRatio,
      "Test Conditions 2",
      expirationBlocks,
      usdcToken.address
    );
    const receipt2 = await tx2.wait();
    const betAddress2 = receipt2.events?.find((e) => e.event === "BetCreated")
      ?.args?.betAddress;

    expect(betAddress1).to.not.equal(betAddress2);

    const bet1 = await ethers.getContractAt("Bet", betAddress1);
    const bet2 = await ethers.getContractAt("Bet", betAddress2);

    const bet1Details = await bet1.bet();
    const bet2Details = await bet2.bet();

    expect(bet1Details.conditions).to.equal("Test Conditions 1");
    expect(bet2Details.conditions).to.equal("Test Conditions 2");
  });

  it("should not allow creating a bet with too short expiration period", async function () {
    const shortExpirationBlocks = 302399; // One block less than the minimum
    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        shortExpirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");
  });
});
