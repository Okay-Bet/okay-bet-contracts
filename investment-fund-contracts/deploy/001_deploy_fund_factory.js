const hre = require("hardhat");

async function main() {
  console.log("Starting deployment to", hre.network.name, "network...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "POL\n");

  // Amoy testnet USDC address (test token)
  const AMOY_USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  // Polygon mainnet USDC address
  const POLYGON_USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
  
  const isMainnet = hre.network.name === "polygon";
  const usdcAddress = isMainnet ? POLYGON_USDC : AMOY_USDC;
  
  console.log("Using USDC address:", usdcAddress);
  console.log("Network:", isMainnet ? "Polygon Mainnet" : "Amoy Testnet\n");

  console.log("Deploying FundFactory...");
  const FundFactory = await hre.ethers.getContractFactory("FundFactory");
  const fundFactory = await FundFactory.deploy(usdcAddress);
  await fundFactory.waitForDeployment();
  
  const factoryAddress = await fundFactory.getAddress();
  console.log("✓ FundFactory deployed to:", factoryAddress);

  const protocolFee = await fundFactory.protocolFee();
  console.log("  Protocol fee:", protocolFee.toString(), "basis points\n");

  // Whitelist initial agents if provided
  const initialAgents = process.env.INITIAL_AGENTS ? 
    process.env.INITIAL_AGENTS.split(',').map(a => a.trim()) : [];
  
  if (initialAgents.length > 0) {
    console.log("Whitelisting initial agents...");
    for (const agent of initialAgents) {
      if (hre.ethers.isAddress(agent)) {
        const tx = await fundFactory.whitelistAgent(agent, true);
        await tx.wait();
        console.log("  ✓ Whitelisted:", agent);
      } else {
        console.log("  ✗ Invalid address:", agent);
      }
    }
    console.log();
  }

  // Set protocol fee if different from default
  if (process.env.PROTOCOL_FEE) {
    const newFee = parseInt(process.env.PROTOCOL_FEE);
    if (newFee !== 50 && newFee <= 100) {
      console.log("Setting protocol fee to:", newFee, "basis points");
      const tx = await fundFactory.setProtocolFee(newFee);
      await tx.wait();
      console.log("✓ Protocol fee updated\n");
    }
  }

  console.log("=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("FundFactory:", factoryAddress);
  console.log("USDC Address:", usdcAddress);
  console.log("Protocol Fee:", protocolFee.toString(), "basis points");
  console.log("Owner:", deployer.address);
  console.log("=".repeat(60));

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    fundFactory: factoryAddress,
    usdc: usdcAddress,
    protocolFee: protocolFee.toString(),
    owner: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber()
  };

  const fs = require('fs');
  const path = require('path');
  const deploymentsDir = path.join(__dirname, '../deployments');
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  const filename = path.join(deploymentsDir, `${hre.network.name}-deployment.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n✓ Deployment info saved to:", filename);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nTo verify the contract on Polygonscan, run:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${factoryAddress} "${usdcAddress}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });