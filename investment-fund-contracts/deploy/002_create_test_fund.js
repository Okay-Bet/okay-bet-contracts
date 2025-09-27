const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Creating test investment fund on", hre.network.name, "...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Creating fund with account:", deployer.address);

  // Load deployment info
  const deploymentsDir = path.join(__dirname, '../deployments');
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error("Error: Deployment file not found. Run 001_deploy_fund_factory.js first.");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  console.log("Using FundFactory at:", deployment.fundFactory);

  // Get FundFactory contract
  const FundFactory = await hre.ethers.getContractFactory("FundFactory");
  const fundFactory = FundFactory.attach(deployment.fundFactory);

  // Test agent wallet (you'll need to whitelist this first)
  const testAgentWallet = deployer.address; // Using deployer as test agent for now
  
  // Check if agent is whitelisted
  const isWhitelisted = await fundFactory.whitelistedAgents(testAgentWallet);
  
  if (!isWhitelisted) {
    console.log("Agent not whitelisted. Whitelisting now...");
    const tx = await fundFactory.whitelistAgent(testAgentWallet, true);
    await tx.wait();
    console.log("✓ Agent whitelisted:", testAgentWallet);
  }

  // Fund parameters for testing
  const fundParams = {
    fundName: "Test Prediction Fund #1",
    agentWallet: testAgentWallet,
    targetRaise: hre.ethers.parseUnits("10000", 6), // 10,000 USDC
    tradingDuration: 7 * 24 * 60 * 60, // 7 days in seconds
    entryFee: 200, // 2%
    carriedInterest: 2000, // 20%
    minInvestment: hre.ethers.parseUnits("100", 6), // 100 USDC minimum
    depositDeadline: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60) // 3 days from now
  };

  console.log("\nCreating fund with parameters:");
  console.log("  Name:", fundParams.fundName);
  console.log("  Agent:", fundParams.agentWallet);
  console.log("  Target Raise: $", hre.ethers.formatUnits(fundParams.targetRaise, 6));
  console.log("  Trading Duration:", fundParams.tradingDuration / (24 * 60 * 60), "days");
  console.log("  Entry Fee:", fundParams.entryFee / 100, "%");
  console.log("  Carried Interest:", fundParams.carriedInterest / 100, "%");
  console.log("  Min Investment: $", hre.ethers.formatUnits(fundParams.minInvestment, 6));
  console.log("  Deposit Deadline:", new Date(fundParams.depositDeadline * 1000).toLocaleString());

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

    // Save fund info
    const fundInfo = {
      ...fundParams,
      fundAddress,
      factoryAddress: deployment.fundFactory,
      network: hre.network.name,
      createdAt: new Date().toISOString(),
      transactionHash: receipt.hash
    };

    const fundsDir = path.join(__dirname, '../deployments/funds');
    if (!fs.existsSync(fundsDir)) {
      fs.mkdirSync(fundsDir, { recursive: true });
    }

    const fundFile = path.join(fundsDir, `${hre.network.name}-fund-${Date.now()}.json`);
    // Convert BigInt values to strings for JSON serialization
    const serializedFundInfo = JSON.parse(JSON.stringify(fundInfo, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    fs.writeFileSync(fundFile, JSON.stringify(serializedFundInfo, null, 2));
    console.log("✓ Fund info saved to:", fundFile);

    console.log("\n" + "=".repeat(60));
    console.log("TEST FUND CREATED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log("Fund Address:", fundAddress);
    console.log("Fund Name:", fundParams.fundName);
    console.log("Status: DEPOSIT PHASE");
    console.log("\nNext steps:");
    console.log("1. Get test USDC from Mumbai faucet");
    console.log("2. Approve USDC spending for the fund");
    console.log("3. Make test deposits");
    console.log("=".repeat(60));
  } else {
    console.error("Error: Could not extract fund address from transaction");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });