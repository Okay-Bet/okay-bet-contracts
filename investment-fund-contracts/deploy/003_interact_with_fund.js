const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Interacting with fund using account:", signer.address);

  // Get the latest fund deployment
  const fundsDir = path.join(__dirname, '../deployments/funds');
  if (!fs.existsSync(fundsDir)) {
    console.error("No funds deployed yet. Run 002_create_test_fund.js first.");
    process.exit(1);
  }

  const fundFiles = fs.readdirSync(fundsDir)
    .filter(f => f.startsWith(`${hre.network.name}-fund-`))
    .sort((a, b) => b.localeCompare(a));

  if (fundFiles.length === 0) {
    console.error("No funds found for this network.");
    process.exit(1);
  }

  const latestFund = JSON.parse(fs.readFileSync(path.join(fundsDir, fundFiles[0]), 'utf8'));
  console.log("Using fund:", latestFund.fundAddress);
  console.log("Fund name:", latestFund.fundName);

  // Get contracts
  const InvestmentFund = await hre.ethers.getContractFactory("InvestmentFund");
  const fund = InvestmentFund.attach(latestFund.fundAddress);

  // Get USDC contract (simplified ERC20 interface)
  const usdcAddress = hre.network.name === "polygon" ? 
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" : 
    "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

  const usdcAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  const usdc = new hre.ethers.Contract(usdcAddress, usdcAbi, signer);

  // Check current fund state
  console.log("\n" + "=".repeat(50));
  console.log("FUND STATUS");
  console.log("=".repeat(50));

  const currentPhase = await fund.getCurrentPhase();
  const phases = ["DEPOSIT", "TRADING", "REDEMPTION"];
  console.log("Current Phase:", phases[currentPhase]);

  const totalDeposits = await fund.totalDeposits();
  const targetRaise = await fund.targetRaise();
  console.log("Total Deposits: $", hre.ethers.formatUnits(totalDeposits, 6));
  console.log("Target Raise: $", hre.ethers.formatUnits(targetRaise, 6));
  console.log("Progress:", (Number(totalDeposits) * 100 / Number(targetRaise)).toFixed(2), "%");

  const totalSupply = await fund.totalSupply();
  console.log("Share Tokens Minted:", hre.ethers.formatEther(totalSupply));

  // Check user's USDC balance
  const usdcBalance = await usdc.balanceOf(signer.address);
  console.log("\nYour USDC Balance: $", hre.ethers.formatUnits(usdcBalance, 6));

  // Check user's share balance
  const shareBalance = await fund.balanceOf(signer.address);
  console.log("Your Share Tokens:", hre.ethers.formatEther(shareBalance));

  // Interactive menu
  console.log("\n" + "=".repeat(50));
  console.log("AVAILABLE ACTIONS");
  console.log("=".repeat(50));

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => readline.question(query, resolve));

  if (currentPhase === 0n) { // DEPOSIT PHASE
    console.log("1. Make a deposit");
    console.log("2. Check deposit deadline");
    console.log("3. Exit");

    const choice = await question("\nEnter your choice (1-3): ");

    switch(choice) {
      case '1':
        const amount = await question("Enter deposit amount in USDC (e.g., 100): ");
        const depositAmount = hre.ethers.parseUnits(amount, 6);
        
        // Check and approve USDC
        const allowance = await usdc.allowance(signer.address, latestFund.fundAddress);
        if (allowance < depositAmount) {
          console.log("\nApproving USDC spend...");
          const approveTx = await usdc.approve(latestFund.fundAddress, depositAmount);
          await approveTx.wait();
          console.log("✓ USDC approved");
        }

        console.log("Making deposit...");
        const depositTx = await fund.deposit(depositAmount);
        await depositTx.wait();
        console.log("✓ Deposit successful!");
        
        const newBalance = await fund.balanceOf(signer.address);
        console.log("Your new share balance:", hre.ethers.formatEther(newBalance));
        break;

      case '2':
        const deadline = await fund.depositDeadline();
        console.log("\nDeposit deadline:", new Date(Number(deadline) * 1000).toLocaleString());
        const timeLeft = Number(deadline) - Math.floor(Date.now() / 1000);
        if (timeLeft > 0) {
          console.log("Time remaining:", Math.floor(timeLeft / 3600), "hours");
        } else {
          console.log("Deposit period has ended");
        }
        break;
    }
  } else if (currentPhase === 1n) { // TRADING PHASE
    console.log("1. Check trading end time");
    console.log("2. View agent wallet");
    console.log("3. Exit");

    const choice = await question("\nEnter your choice (1-3): ");

    switch(choice) {
      case '1':
        const tradingEnd = await fund.tradingEndTime();
        console.log("\nTrading ends:", new Date(Number(tradingEnd) * 1000).toLocaleString());
        const timeLeft = Number(tradingEnd) - Math.floor(Date.now() / 1000);
        if (timeLeft > 0) {
          console.log("Time remaining:", Math.floor(timeLeft / 86400), "days");
        }
        break;

      case '2':
        const agentWallet = await fund.agentWallet();
        console.log("\nAgent wallet:", agentWallet);
        const agentBalance = await usdc.balanceOf(agentWallet);
        console.log("Agent USDC balance: $", hre.ethers.formatUnits(agentBalance, 6));
        break;
    }
  } else if (currentPhase === 2n) { // REDEMPTION PHASE
    console.log("1. Calculate final NAV");
    console.log("2. Redeem shares");
    console.log("3. Check your redemption amount");
    console.log("4. Exit");

    const choice = await question("\nEnter your choice (1-4): ");

    switch(choice) {
      case '1':
        if (!(await fund.finalNAVCalculated())) {
          console.log("\nCalculating final NAV...");
          const calcTx = await fund.calculateFinalNAV();
          await calcTx.wait();
          console.log("✓ NAV calculated");
        }
        const finalNAV = await fund.finalNAVPerShare();
        console.log("Final NAV per share:", hre.ethers.formatUnits(finalNAV, 6));
        break;

      case '2':
        if (shareBalance > 0n) {
          console.log("\nRedeeming shares...");
          const redeemTx = await fund.redeem(shareBalance);
          await redeemTx.wait();
          console.log("✓ Redemption successful!");
          
          const newUsdcBalance = await usdc.balanceOf(signer.address);
          console.log("Your new USDC balance: $", hre.ethers.formatUnits(newUsdcBalance, 6));
        } else {
          console.log("\nYou have no shares to redeem");
        }
        break;

      case '3':
        if (shareBalance > 0n) {
          const finalNAV = await fund.finalNAVPerShare();
          const redemptionAmount = (shareBalance * finalNAV) / hre.ethers.parseEther("1");
          console.log("\nYour redemption value: $", hre.ethers.formatUnits(redemptionAmount, 6));
        } else {
          console.log("\nYou have no shares");
        }
        break;
    }
  }

  readline.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });