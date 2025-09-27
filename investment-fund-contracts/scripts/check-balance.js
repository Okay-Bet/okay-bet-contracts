const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Network:", hre.network.name);
  console.log("Wallet:", signer.address);
  
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "POL");
  
  // Check gas price
  const feeData = await hre.ethers.provider.getFeeData();
  console.log("Gas Price:", hre.ethers.formatUnits(feeData.gasPrice, "gwei"), "gwei");
  
  // Estimate gas for fund creation (roughly)
  const estimatedGas = 3000000n; // 3M gas units for fund deployment
  const estimatedCost = (feeData.gasPrice * estimatedGas) / 10n**18n;
  console.log("\nEstimated deployment cost:", hre.ethers.formatEther(feeData.gasPrice * estimatedGas), "POL");
  
  if (balance < feeData.gasPrice * estimatedGas) {
    console.log("\n⚠️  Insufficient balance for deployment!");
    console.log("You need at least:", hre.ethers.formatEther(feeData.gasPrice * estimatedGas), "POL");
    console.log("\nGet test POL from:");
    console.log("1. https://faucet.polygon.technology/");
    console.log("2. https://faucets.chain.link/polygon-amoy");
  } else {
    console.log("\n✓ Sufficient balance for deployment");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });