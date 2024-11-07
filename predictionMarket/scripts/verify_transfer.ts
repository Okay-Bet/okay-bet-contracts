// scripts/verify-transfer.ts
import { ethers } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';

async function verifyTransfer() {
  const USDC_DECIMALS = 6;
  const EXPECTED_AMOUNT = parseUnits("0.02", USDC_DECIMALS); // 2 cents

  const contracts = {
    polygon: {
      usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
    }
  };

  console.log('\n--- Verifying USDC Transfer on Polygon ---');

  // Get signer
  const signer = (await ethers.getSigners())[0];
  console.log(`Checking balance for: ${signer.address}`);

  // Setup USDC contract
  const usdc = await ethers.getContractAt('IERC20', contracts.polygon.usdc);

  // Check USDC balance
  const balance = await usdc.balanceOf(signer.address);
  console.log(`\nCurrent USDC Balance: ${ethers.utils.formatUnits(balance, USDC_DECIMALS)} USDC`);

  if (balance.gte(EXPECTED_AMOUNT)) {
    console.log('\n✅ Transfer successful! USDC received on Polygon');
    console.log('\nYou can now proceed with the buy order using:\nnpx hardhat run scripts/buy-position.ts --network polygon');
  } else {
    console.log('\n❌ Transfer not yet received or failed');
    console.log('Please wait a few more minutes and try again');
  }
}

verifyTransfer()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });