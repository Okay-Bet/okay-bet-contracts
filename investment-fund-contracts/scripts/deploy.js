const hre = require("hardhat");

async function main() {
  console.log("Starting deployment...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance));
  
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  
  console.log("\nDeploying FundFactory...");
  const FundFactory = await hre.ethers.getContractFactory("FundFactory");
  const factory = await FundFactory.deploy(USDC_ADDRESS);
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("FundFactory deployed to:", factoryAddress);
  
  console.log("\nSetting initial configuration...");
  
  const INITIAL_AGENTS = process.env.INITIAL_AGENTS ? process.env.INITIAL_AGENTS.split(",") : [];
  if (INITIAL_AGENTS.length > 0) {
    console.log("Whitelisting initial agents...");
    const statuses = new Array(INITIAL_AGENTS.length).fill(true);
    await factory.batchWhitelistAgents(INITIAL_AGENTS, statuses);
    console.log(`Whitelisted ${INITIAL_AGENTS.length} agents`);
  }
  
  const PROTOCOL_FEE = process.env.PROTOCOL_FEE || "50";
  if (PROTOCOL_FEE !== "50") {
    console.log(`Setting protocol fee to ${PROTOCOL_FEE} basis points...`);
    await factory.setProtocolFee(PROTOCOL_FEE);
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Network:", hre.network.name);
  console.log("FundFactory:", factoryAddress);
  console.log("USDC Address:", USDC_ADDRESS);
  console.log("Protocol Fee:", PROTOCOL_FEE, "basis points");
  console.log("Whitelisted Agents:", INITIAL_AGENTS.length);
  
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nVerifying contract on Etherscan...");
    await hre.run("verify:verify", {
      address: factoryAddress,
      constructorArguments: [USDC_ADDRESS],
    });
    console.log("Contract verified!");
  }
  
  console.log("\nDeployment complete!");
  
  return {
    factory: factoryAddress,
    usdc: USDC_ADDRESS
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });