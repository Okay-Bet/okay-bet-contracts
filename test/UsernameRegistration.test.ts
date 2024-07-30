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

  it("should allow a user to register a username", async function () {
    await expect(usernameRegistry.connect(user1).registerUsername("alice"))
      .to.emit(usernameRegistry, "UsernameRegistered")
      .withArgs("alice", user1.address);

    expect(await usernameRegistry.getAddressByUsername("alice")).to.equal(user1.address);
    expect(await usernameRegistry.getUsernameByAddress(user1.address)).to.equal("alice");
  });

  it("should not allow registering an empty username", async function () {
    await expect(usernameRegistry.connect(user1).registerUsername(""))
      .to.be.revertedWith("Username cannot be empty");
  });

  it("should not allow registering a username that's already taken", async function () {
    await usernameRegistry.connect(user1).registerUsername("bob");
    await expect(usernameRegistry.connect(user2).registerUsername("bob"))
      .to.be.revertedWith("Username already taken");
  });

  it("should not allow a user to register multiple usernames", async function () {
    await usernameRegistry.connect(user1).registerUsername("charlie");
    await expect(usernameRegistry.connect(user1).registerUsername("david"))
      .to.be.revertedWith("Address already has a username");
  });

  it("should return the correct address for a username", async function () {
    await usernameRegistry.connect(user1).registerUsername("eve");
    expect(await usernameRegistry.getAddressByUsername("eve")).to.equal(user1.address);
  });

  it("should return the correct username for an address", async function () {
    await usernameRegistry.connect(user2).registerUsername("frank");
    expect(await usernameRegistry.getUsernameByAddress(user2.address)).to.equal("frank");
  });

  it("should return an empty string for an unregistered address", async function () {
    expect(await usernameRegistry.getUsernameByAddress(user1.address)).to.equal("");
  });

  it("should return the zero address for an unregistered username", async function () {
    expect(await usernameRegistry.getAddressByUsername("nonexistent")).to.equal(ethers.constants.AddressZero);
  });
});