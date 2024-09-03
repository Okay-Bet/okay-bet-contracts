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

  it("should reject creating a bet with wager ratio below 0", async function () {
    const invalidWagerRatio = 255; // This will underflow to -1 in uint8

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        invalidWagerRatio,
        "Test Conditions",
        expirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");
  });

  it("should reject creating a bet with wager ratio above 100", async function () {
    const invalidWagerRatio = 101;

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        invalidWagerRatio,
        "Test Conditions",
        expirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");
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

  it("should create a bet with minimum allowed expiration blocks", async function () {
    const minExpirationBlocks = 302400;
    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      "Test Conditions",
      minExpirationBlocks,
      usdcToken.address
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");
    expect(event).to.not.be.undefined;

    const betAddress = event?.args?.betAddress;
    const bet = await ethers.getContractAt("Bet", betAddress);
    const betDetails = await bet.bet();

    expect(betDetails.expirationBlock).to.equal(
      (await ethers.provider.getBlockNumber()) + minExpirationBlocks
    );
  });

  it("should reject creating a bet with expiration blocks below the minimum", async function () {
    const belowMinExpirationBlocks = 302399; // One block less than the minimum

    await expect(
      betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        wagerRatio,
        "Test Conditions",
        belowMinExpirationBlocks,
        usdcToken.address
      )
    ).to.be.revertedWith("Invalid parameters");
  });

  it("should create a bet with a very large wager without overflow", async function () {
    // Use a large but safe value, e.g., 2^200
    const largeWager = ethers.BigNumber.from(2).pow(200);

    // Mint a large amount of tokens to the maker and taker
    await usdcToken.mint(maker.address, largeWager);
    await usdcToken.mint(taker.address, largeWager);

    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      largeWager,
      50, // 50-50 split for simplicity
      "Large Wager Test",
      expirationBlocks,
      usdcToken.address
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");
    expect(event).to.not.be.undefined;

    const betAddress = event?.args?.betAddress;
    const bet = await ethers.getContractAt("Bet", betAddress);
    const betDetails = await bet.bet();

    expect(betDetails.totalWager).to.equal(largeWager);

    // Additional checks to ensure no overflow occurred
    const makerWager = await bet.getWagerAmount(maker.address);
    const takerWager = await bet.getWagerAmount(taker.address);

    expect(makerWager.add(takerWager)).to.equal(largeWager);
  });

  it("should create multiple bets in succession with unique addresses", async function () {
    const numberOfBets = 5; // We'll create 5 bets
    const betAddresses: string[] = [];

    for (let i = 0; i < numberOfBets; i++) {
      const tx = await betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        50, // 50-50 split for simplicity
        `Test Conditions for Bet ${i + 1}`,
        expirationBlocks,
        usdcToken.address
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "BetCreated");
      expect(event).to.not.be.undefined;

      const betAddress = event?.args?.betAddress;
      betAddresses.push(betAddress);

      // Verify that this bet address is unique
      expect(
        betAddresses.filter((addr) => addr === betAddress).length
      ).to.equal(1);

      // Additional verification: check that the bet contract exists and has correct parameters
      const bet = await ethers.getContractAt("Bet", betAddress);
      const betDetails = await bet.bet();

      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.totalWager).to.equal(totalWager);
      expect(betDetails.conditions).to.equal(
        `Test Conditions for Bet ${i + 1}`
      );
    }

    // Verify that we have the expected number of unique addresses
    expect(new Set(betAddresses).size).to.equal(numberOfBets);
  });

  it("should create multiple bets in succession with unique addresses", async function () {
    const numberOfBets = 5; // We'll create 5 bets
    const betAddresses: string[] = [];

    for (let i = 0; i < numberOfBets; i++) {
      const tx = await betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        50, // 50-50 split for simplicity
        `Test Conditions for Bet ${i + 1}`,
        expirationBlocks,
        usdcToken.address
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "BetCreated");
      expect(event).to.not.be.undefined;

      const betAddress = event?.args?.betAddress;
      betAddresses.push(betAddress);

      // Verify that this bet address is unique
      expect(
        betAddresses.filter((addr) => addr === betAddress).length
      ).to.equal(1);

      // Additional verification: check that the bet contract exists and has correct parameters
      const bet = await ethers.getContractAt("Bet", betAddress);
      const betDetails = await bet.bet();

      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.totalWager).to.equal(totalWager);
      expect(betDetails.conditions).to.equal(
        `Test Conditions for Bet ${i + 1}`
      );
    }

    // Verify that we have the expected number of unique addresses
    expect(new Set(betAddresses).size).to.equal(numberOfBets);
  });

  it("should allow creating a bet with maker as the judge", async function () {
    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      maker.address, // Maker is also the judge
      totalWager,
      50,
      "Maker is Judge Test",
      expirationBlocks,
      usdcToken.address
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");
    expect(event).to.not.be.undefined;

    const betAddress = event?.args?.betAddress;
    const bet = await ethers.getContractAt("Bet", betAddress);
    const betDetails = await bet.bet();

    expect(betDetails.maker).to.equal(maker.address);
    expect(betDetails.taker).to.equal(taker.address);
    expect(betDetails.judge).to.equal(maker.address);
  });

  it("should allow creating a bet with taker as the judge", async function () {
    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      taker.address, // Taker is also the judge
      totalWager,
      50,
      "Taker is Judge Test",
      expirationBlocks,
      usdcToken.address
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");
    expect(event).to.not.be.undefined;

    const betAddress = event?.args?.betAddress;
    const bet = await ethers.getContractAt("Bet", betAddress);
    const betDetails = await bet.bet();

    expect(betDetails.maker).to.equal(maker.address);
    expect(betDetails.taker).to.equal(taker.address);
    expect(betDetails.judge).to.equal(taker.address);
  });

  it("should emit accurate data in the BetCreated event", async function () {
    const maker = await ethers.getSigner(0);
    const taker = await ethers.getSigner(1);
    const judge = await ethers.getSigner(2);

    const totalWager = ethers.utils.parseUnits("100", 6); // Assuming 6 decimals for USDC
    const wagerRatio = 75; // 75-25 split
    const conditions = "Test event emission accuracy";
    const expirationBlocks = 302400; // Minimum allowed

    const tx = await betFactory.createBet(
      maker.address,
      taker.address,
      judge.address,
      totalWager,
      wagerRatio,
      conditions,
      expirationBlocks,
      usdcToken.address
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e) => e.event === "BetCreated");

    expect(event).to.not.be.undefined;

    if (event && event.args) {
      // Check betAddress
      expect(event.args.betAddress).to.be.properAddress;

      // Check participants
      expect(event.args.maker).to.equal(maker.address);
      expect(event.args.taker).to.equal(taker.address);
      expect(event.args.judge).to.equal(judge.address);

      // Check wager details
      expect(event.args.totalWager).to.equal(totalWager);
      expect(event.args.wagerRatio).to.equal(wagerRatio);

      // Check conditions
      expect(event.args.conditions).to.equal(conditions);

      // Check expiration block
      const currentBlock = await ethers.provider.getBlockNumber();
      expect(event.args.expirationBlock).to.equal(
        currentBlock + expirationBlocks
      );

      // Check wager currency
      expect(event.args.wagerCurrency).to.equal(usdcToken.address);

      // Verify the created Bet contract
      const bet = await ethers.getContractAt("Bet", event.args.betAddress);
      const betDetails = await bet.bet();

      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.totalWager).to.equal(totalWager);
      expect(betDetails.wagerRatio).to.equal(wagerRatio);
      expect(betDetails.conditions).to.equal(conditions);
      expect(betDetails.expirationBlock).to.equal(
        currentBlock + expirationBlocks
      );
    } else {
      throw new Error("BetCreated event not emitted");
    }
  });

  describe("BetFactory and Bet with Non-Standard ERC20", function () {
    let betFactory: BetFactory;
    let mockToken: MockToken;
    let maker: SignerWithAddress;
    let taker: SignerWithAddress;
    let judge: SignerWithAddress;
    const totalWager = ethers.utils.parseUnits("100", 9); // 100 tokens with 9 decimals
    const expirationBlocks = 302400; // 1 week

    beforeEach(async function () {
      [maker, taker, judge] = await ethers.getSigners();

      // Deploy MockToken
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      mockToken = await MockTokenFactory.deploy("Non-Standard Token", "NST", 9);
      await mockToken.deployed();

      // Mint tokens to maker and taker
      await mockToken.mint(maker.address, totalWager.mul(2));
      await mockToken.mint(taker.address, totalWager.mul(2));

      // Deploy BetFactory
      const BetFactoryFactory = await ethers.getContractFactory("BetFactory");
      betFactory = await BetFactoryFactory.deploy();
      await betFactory.deployed();
    });

    it("should create a bet with non-standard ERC20 token", async function () {
      const tx = await betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        50, // 50-50 split
        "Non-standard token test",
        expirationBlocks,
        mockToken.address
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "BetCreated");

      expect(event, "BetCreated event should be emitted").to.not.be.undefined;

      const betAddress = event?.args?.betAddress;

      expect(betAddress, "Bet address should be defined").to.not.be.undefined;
      expect(
        ethers.utils.isAddress(betAddress),
        "Bet address should be a valid Ethereum address"
      ).to.be.true;

      const bet = await ethers.getContractAt("Bet", betAddress);
      const betDetails = await bet.getBetDetails();
      expect(betDetails.wagerCurrency).to.equal(mockToken.address);
      expect(
        betDetails.wagerCurrency,
        "Wager currency should match mock token address"
      ).to.equal(mockToken.address);
      expect(betDetails.maker).to.equal(maker.address);
      expect(betDetails.taker).to.equal(taker.address);
      expect(betDetails.judge).to.equal(judge.address);
      expect(betDetails.wagerRatio).to.equal(50);
      expect(betDetails.conditions).to.equal("Non-standard token test");

      // Check if the bet contract has the correct balance of mock tokens
      const betBalance = await mockToken.balanceOf(betAddress);
      expect(betBalance).to.equal(0, "Newly created bet should have 0 balance");
    });

    it("should fund and resolve a bet with non-standard ERC20 token", async function () {
      const tx = await betFactory.createBet(
        maker.address,
        taker.address,
        judge.address,
        totalWager,
        50, // 50-50 split
        "Non-standard token test",
        expirationBlocks,
        mockToken.address
      );

      const receipt = await tx.wait();
      const betAddress = receipt.events?.find((e) => e.event === "BetCreated")
        ?.args?.betAddress;
      const bet = await ethers.getContractAt("Bet", betAddress);

      // Approve and fund the bet
      await mockToken.connect(maker).approve(betAddress, totalWager.div(2));
      await mockToken.connect(taker).approve(betAddress, totalWager.div(2));
      await bet.connect(maker).fundBet(totalWager.div(2));
      await bet.connect(taker).fundBet(totalWager.div(2));

      const fundedBetDetails = await bet.bet();
      expect(fundedBetDetails.status).to.equal(2); // FullyFunded status

      // Resolve the bet
      const makerBalanceBefore = await mockToken.balanceOf(maker.address);
      await bet.connect(judge).resolveBet(maker.address);

      const resolvedBetDetails = await bet.bet();
      expect(resolvedBetDetails.status).to.equal(3); // Resolved status
      expect(resolvedBetDetails.winner).to.equal(maker.address);

      // Check that the winner received the correct amount
      const makerBalanceAfter = await mockToken.balanceOf(maker.address);
      expect(makerBalanceAfter.sub(makerBalanceBefore)).to.equal(totalWager);
    });
  });
});
