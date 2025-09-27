const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Making deposit with account:", signer.address);

  // Fund and USDC addresses (new fund with 5 USDC minimum)
  const FUND_ADDRESS = "0x8A136572B7b72AE8582cc49FEB231c4850FE8cD0";
  const USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  
  // Amount to deposit (10 USDC - using all available)
  const depositAmount = hre.ethers.parseUnits("10", 6);
  
  // Get contracts
  const InvestmentFund = await hre.ethers.getContractFactory("InvestmentFund");
  const fund = InvestmentFund.attach(FUND_ADDRESS);
  
  const usdcAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];
  const usdc = new hre.ethers.Contract(USDC_ADDRESS, usdcAbi, signer);
  
  // Check balances before
  const usdcBalanceBefore = await usdc.balanceOf(signer.address);
  const shareBalanceBefore = await fund.balanceOf(signer.address);
  
  console.log("\nBefore Deposit:");
  console.log("  USDC Balance: $", hre.ethers.formatUnits(usdcBalanceBefore, 6));
  console.log("  Share Tokens:", hre.ethers.formatEther(shareBalanceBefore));
  
  // Check current phase
  const phase = await fund.getCurrentPhase();
  if (phase !== 0n) {
    console.error("Fund is not in deposit phase!");
    process.exit(1);
  }
  
  // Check and approve USDC
  console.log("\nChecking USDC approval...");
  const allowance = await usdc.allowance(signer.address, FUND_ADDRESS);
  
  if (allowance < depositAmount) {
    console.log("Approving USDC spend...");
    const approveTx = await usdc.approve(FUND_ADDRESS, depositAmount);
    await approveTx.wait();
    console.log("✓ USDC approved");
  } else {
    console.log("✓ USDC already approved");
  }
  
  // Make deposit
  console.log("\nDepositing", hre.ethers.formatUnits(depositAmount, 6), "USDC...");
  const depositTx = await fund.deposit(depositAmount);
  const receipt = await depositTx.wait();
  console.log("✓ Deposit successful!");
  console.log("  Transaction:", receipt.hash);
  
  // Check balances after
  const usdcBalanceAfter = await usdc.balanceOf(signer.address);
  const shareBalanceAfter = await fund.balanceOf(signer.address);
  const totalDeposits = await fund.totalDeposits();
  const targetRaise = await fund.targetRaise();
  
  console.log("\nAfter Deposit:");
  console.log("  USDC Balance: $", hre.ethers.formatUnits(usdcBalanceAfter, 6));
  console.log("  Share Tokens:", hre.ethers.formatEther(shareBalanceAfter));
  console.log("\nFund Status:");
  console.log("  Total Deposits: $", hre.ethers.formatUnits(totalDeposits, 6));
  console.log("  Target Raise: $", hre.ethers.formatUnits(targetRaise, 6));
  console.log("  Progress:", (Number(totalDeposits) * 100 / Number(targetRaise)).toFixed(2), "%");
  
  console.log("\n✅ You are now an investor in the fund!");
  console.log("Your shares will earn profits when the trading phase completes successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });