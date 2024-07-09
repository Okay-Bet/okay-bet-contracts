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
        const tx = await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions");
        const receipt = await tx.wait();

        const betAddress = receipt.events?.find((event: any) => event.event === "BetCreated")?.args?.betAddress;
        console.log("Created Bet at:", betAddress);

        const BetContract = await ethers.getContractAt("Bet", betAddress);
        const betDetails = await BetContract.bet();
        console.log("Bet Details:", betDetails);

        expect(betDetails.better1).to.equal(better1.address);
    });

    it("should return the correct number of bets", async function () {
        await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Test Conditions");
        await betFactory.createBet(better1.address, better2.address, decider.address, ethers.utils.parseEther("1"), "Another Test");

        const bets = await betFactory.getBets();
        console.log("Bets created:", bets);
        expect(bets.length).to.equal(2);
    });
});
