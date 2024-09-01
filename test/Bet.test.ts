import { expect } from "chai";
import { ethers } from "hardhat";
import { Bet, Bet__factory, MockERC20 } from "../typechain-types";

describe("Bet Contract", function () {
  let bet: Bet;
  let maker: any;
  let taker: any;
  let judge: any;
  let usdcToken: IERC20;
  const totalWager = ethers.utils.parseUnits("100", 6); // Assuming USDC has 6 decimals
  const wagerRatio = 50; // Equal split
  const expirationBlocks = 50400; // 1 week

  beforeEach(async function () {
    [maker, taker, judge] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdcToken.deployed();

    // Deploy BetV2
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

    // Mint USDC to maker and taker
    await usdcToken.mint(maker.address, totalWager);
    await usdcToken.mint(taker.address, totalWager);
  });

  it("should be deployed with correct initial state", async function () {
    const betDetails = await bet.bet();
    expect(betDetails.maker).to.equal(maker.address);
    expect(betDetails.taker).to.equal(taker.address);
    expect(betDetails.judge).to.equal(judge.address);
    expect(betDetails.totalWager).to.equal(totalWager);
    expect(betDetails.wagerRatio).to.equal(wagerRatio);
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
  
    await expect(bet.checkExpiration())
      .to.emit(bet, "BetExpired");
  
    const betDetails = await bet.bet();
    expect(betDetails.status).to.equal(5); // Expired
  });
  

  // Add more tests as needed...
});
