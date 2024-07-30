import { expect } from "chai";
import { ethers } from "hardhat";
import { UsernameRegistry, UsernameRegistry__factory } from "../typechain-types";

describe("UsernameRegistry Contract", function () {
    let usernameRegistry: UsernameRegistry;
    let owner: any;
    let user1: any;
    let user2: any;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        const UsernameRegistryFactory = await ethers.getContractFactory("UsernameRegistry", owner);
        usernameRegistry = await UsernameRegistryFactory.deploy();
        await usernameRegistry.deployed();
    });

    it("should allow a user to register a lowercase username", async function () {
        await expect(usernameRegistry.connect(user1).registerUsername("alice123"))
            .to.emit(usernameRegistry, "UsernameRegistered")
            .withArgs("alice123", user1.address);

        expect(await usernameRegistry.getAddressByUsername("alice123")).to.equal(user1.address);
        expect(await usernameRegistry.getUsernameByAddress(user1.address)).to.equal("alice123");
    });

    it("should convert uppercase to lowercase when registering", async function () {
        await usernameRegistry.connect(user1).registerUsername("BOB456");
        expect(await usernameRegistry.getUsernameByAddress(user1.address)).to.equal("bob456");
    });

    it("should not allow registering an empty username", async function () {
        await expect(usernameRegistry.connect(user1).registerUsername(""))
            .to.be.revertedWith("Username cannot be empty");
    });

    it("should not allow registering a username that's already taken", async function () {
        await usernameRegistry.connect(user1).registerUsername("charlie789");
        await expect(usernameRegistry.connect(user2).registerUsername("CHARLIE789"))
            .to.be.revertedWith("Username already taken");
    });

    it("should not allow a user to register multiple usernames", async function () {
        await usernameRegistry.connect(user1).registerUsername("david123");
        await expect(usernameRegistry.connect(user1).registerUsername("eve456"))
            .to.be.revertedWith("Address already has a username");
    });

    it("should return the correct address for a username", async function () {
        await usernameRegistry.connect(user1).registerUsername("frank789");
        expect(await usernameRegistry.getAddressByUsername("FRANK789")).to.equal(user1.address);
    });

    it("should not allow usernames with invalid characters", async function () {
        await expect(usernameRegistry.connect(user1).registerUsername("user_name"))
            .to.be.revertedWith("Username contains invalid characters");
        await expect(usernameRegistry.connect(user1).registerUsername("user.name"))
            .to.be.revertedWith("Username contains invalid characters");
    });

    it("should not allow usernames longer than 24 characters", async function () {
        await expect(usernameRegistry.connect(user1).registerUsername("thisusernameiswaaaaaaaytolong"))
            .to.be.revertedWith("Username too long");
    });

    it("should return an empty string for an unregistered address", async function () {
        expect(await usernameRegistry.getUsernameByAddress(user1.address)).to.equal("");
    });

    it("should return the zero address for an unregistered username", async function () {
        expect(await usernameRegistry.getAddressByUsername("nonexistent")).to.equal(ethers.constants.AddressZero);
    });
});