const hre = require("hardhat");

async function main() {
  console.log("Creating test fund with low minimum investment on", hre.network.name, "...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Creating fund with account:", deployer.address);

  // Get FundFactory contract (new deployment with 5 USDC minimum)
  const factoryAddress = "0x5eA0B0b61A99c1AbAB3235fd1c358dEaFe426900";
  const FundFactory = await hre.ethers.getContractFactory("FundFactory");
  const fundFactory = FundFactory.attach(factoryAddress);
  
  // Check and whitelist agent if needed
  const isWhitelisted = await fundFactory.whitelistedAgents(deployer.address);
  if (!isWhitelisted) {
    console.log("Whitelisting agent first...");
    const whitelistTx = await fundFactory.whitelistAgent(deployer.address, true);
    await whitelistTx.wait();
    console.log("✓ Agent whitelisted\n");
  }

  // Fund parameters with LOW minimum investment (5 USDC)
  const fundParams = {
    fundName: "Low Min Test Fund",
    agentWallet: deployer.address,
    targetRaise: hre.ethers.parseUnits("1000", 6), // 1000 USDC target (minimum allowed)
    tradingDuration: 2 * 24 * 60 * 60, // 2 days
    entryFee: 100, // 1%
    carriedInterest: 1500, // 15%
    minInvestment: hre.ethers.parseUnits("5", 6), // 5 USDC minimum - new factory minimum!
    depositDeadline: Math.floor(Date.now() / 1000) + (12 * 60 * 60) // 12 hours from now
  };

  console.log("Creating fund with parameters:");
  console.log("  Name:", fundParams.fundName);
  console.log("  Min Investment: $", hre.ethers.formatUnits(fundParams.minInvestment, 6), "(LOW!)");
  console.log("  Target Raise: $", hre.ethers.formatUnits(fundParams.targetRaise, 6));
  console.log("  Trading Duration:", fundParams.tradingDuration / (24 * 60 * 60), "days");
  console.log("  Entry Fee:", fundParams.entryFee / 100, "%");
  console.log("  Carried Interest:", fundParams.carriedInterest / 100, "%");

  console.log("\nCreating fund...");
  const createTx = await fundFactory.createFund(
    fundParams.fundName,
    fundParams.agentWallet,
    fundParams.targetRaise,
    fundParams.tradingDuration,
    fundParams.entryFee,
    fundParams.carriedInterest,
    fundParams.minInvestment,
    fundParams.depositDeadline
  );

  const receipt = await createTx.wait();
  console.log("✓ Transaction confirmed:", receipt.hash);

  // Get fund address from events
  const fundCreatedEvent = receipt.logs.find(
    log => log.topics[0] === hre.ethers.id("FundCreated(address,address,address,string,uint256)")
  );

  if (fundCreatedEvent) {
    const fundAddress = hre.ethers.getAddress("0x" + fundCreatedEvent.topics[1].slice(26));
    console.log("\n✓ Fund created at:", fundAddress);

    console.log("\n" + "=".repeat(60));
    console.log("LOW MINIMUM FUND CREATED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log("Fund Address:", fundAddress);
    console.log("Minimum Investment: Only $1 USDC!");
    console.log("\nYou can now deposit your 10 USDC into this fund!");
    console.log("=".repeat(60));

    // Save fund info
    const fs = require('fs');
    const path = require('path');
    const fundInfo = {
      ...fundParams,
      fundAddress,
      factoryAddress,
      network: hre.network.name,
      createdAt: new Date().toISOString(),
      transactionHash: receipt.hash
    };

    const fundsDir = path.join(__dirname, '../deployments/funds');
    const fundFile = path.join(fundsDir, `amoy-fund-lowmin-${Date.now()}.json`);
    
    // Convert BigInt to string for JSON
    const serializedInfo = JSON.parse(JSON.stringify(fundInfo, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    
    fs.writeFileSync(fundFile, JSON.stringify(serializedInfo, null, 2));
    console.log("\n✓ Fund info saved to:", fundFile);
    
    return fundAddress;
  }
}

main()
  .then((fundAddress) => {
    console.log("\nNext: Run deposit script with this fund address:", fundAddress);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });