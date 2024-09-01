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
  const expirationBlocks = 50400; // 1 week

  beforeEach(async function () {
    [maker, taker, judge] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
    await usdcToken.deployed();

    // Deploy BetFactory
    const BetFactoryFactory = await ethers.getContractFactory(
      "contracts/BetFactory.sol:BetFactory"
    );
    betFactory = await BetFactoryFactory.deploy(usdcToken.address);
    await betFactory.deployed();
  });

  it("should create a new bet", async function () {
    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        expirationBlocks
      )
    ).to.emit(betFactory, "BetCreated");

    const bets = await betFactory.getBets();
    expect(bets.length).to.equal(1);

    const betAddress = bets[0];
    const bet = Bet__factory.connect(betAddress, maker);
    const betDetails = await bet.bet();

    expect(betDetails.maker).to.equal(maker.address);
    expect(betDetails.taker).to.equal(taker.address);
    expect(betDetails.judge).to.equal(judge.address);
    expect(betDetails.totalWager).to.equal(totalWager);
    expect(betDetails.wagerRatio).to.equal(wagerRatio);
    expect(betDetails.conditions).to.equal("Test Conditions");
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
        expirationBlocks
      )
    ).to.be.revertedWith("Maker and taker must be different addresses");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        0, // Invalid total wager
        wagerRatio,
        "Test Conditions",
        expirationBlocks
      )
    ).to.be.revertedWith("Total wager must be greater than 0");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        101, // Invalid wager ratio
        "Test Conditions",
        expirationBlocks
      )
    ).to.be.revertedWith("Wager ratio must be between 0 and 100");

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        1000 // Too short expiration period
      )
    ).to.be.revertedWith("Expiration period too short");
  });

  it("should return all created bets", async function () {
    await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      "Test Conditions 1",
      expirationBlocks
    );

    await betFactory.createBet(
      taker.address,
      maker.address,
      judge.address,
      totalWager.mul(2),
      wagerRatio,
      "Test Conditions 2",
      expirationBlocks
    );

    const bets = await betFactory.getBets();
    expect(bets.length).to.equal(2);

    const bet1 = Bet__factory.connect(bets[0], maker);
    const bet2 = Bet__factory.connect(bets[1], maker);

    const bet1Details = await bet1.bet();
    const bet2Details = await bet2.bet();

    expect(bet1Details.conditions).to.equal("Test Conditions 1");
    expect(bet2Details.conditions).to.equal("Test Conditions 2");
  });

  // Add more tests as needed...
});
