const hre = require("hardhat");

async function main() {
  if (hre.network.name !== "amoy") {
    console.error("This script only works on Amoy testnet");
    process.exit(1);
  }

  const [signer] = await hre.ethers.getSigners();
  console.log("Getting test USDC for:", signer.address);

  // Amoy test USDC address
  const AMOY_USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  
  // Mock USDC contract ABI (for Mumbai test token which might have mint function)
  const usdcAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function mint(address to, uint256 amount) returns (bool)",
    "function faucet() returns (bool)"
  ];

  const usdc = new hre.ethers.Contract(AMOY_USDC, usdcAbi, signer);

  // Check current balance
  const balanceBefore = await usdc.balanceOf(signer.address);
  console.log("Current balance: $", hre.ethers.formatUnits(balanceBefore, 6));

  console.log("\n" + "=".repeat(50));
  console.log("OPTIONS FOR GETTING TEST USDC:");
  console.log("=".repeat(50));
  console.log("\n1. Circle Faucet (recommended):");
  console.log("   Visit: https://faucet.circle.com");
  console.log("   Select Polygon Amoy network");
  console.log("   Your address:", signer.address);
  
  console.log("\n2. Polygon Faucet (for test MATIC/POL):");
  console.log("   Visit: https://faucet.polygon.technology/");
  console.log("   Network: Polygon Amoy");
  console.log("   Get test MATIC/POL for gas");

  console.log("\n3. Direct from Contract (if available):");
  console.log("   Attempting to call faucet function...");

  try {
    // Try to call faucet if it exists
    const tx = await usdc.faucet();
    await tx.wait();
    console.log("   ✓ Faucet called successfully!");
    
    const balanceAfter = await usdc.balanceOf(signer.address);
    const received = balanceAfter - balanceBefore;
    console.log("   Received: $", hre.ethers.formatUnits(received, 6));
  } catch (e) {
    console.log("   ✗ Faucet function not available on this USDC contract");
    console.log("   Please use option 1 or 2 above");
  }

  console.log("\n" + "=".repeat(50));
  console.log("USEFUL ADDRESSES:");
  console.log("=".repeat(50));
  console.log("Your wallet:", signer.address);
  console.log("Amoy USDC:", AMOY_USDC);
  console.log("Amoy MATIC faucet: https://faucet.polygon.technology/");
  console.log("Amoy Explorer: https://amoy.polygonscan.com/");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });