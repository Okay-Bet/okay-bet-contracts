// scripts/buy-position.ts
import { ethers } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';

async function buyPosition() {
  const contracts = {
    polygon: {
      router: '0x5fdF4D925198DA8db32fb29635ec6f391B9f9819',
      trader: '0x49774C0d25Cb3B098162da5f3e53f3fd3026546C',
      usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
    }
  };

  // Position parameters
  const tokenId = '123'; // Replace with actual token ID
  const amount = parseUnits('1', 6); // Buy 1 position token
  const maxPrice = parseUnits('0.02', 6); // Max price 2 cents

  console.log('\n--- Buying Polymarket Position ---');

  // Get signer
  const signer = (await ethers.getSigners())[0];
  console.log(`Using account: ${signer.address}`);

  // Setup contracts
  const usdc = await ethers.getContractAt('IERC20', contracts.polygon.usdc);
  const trader = await ethers.getContractAt('LayerZeroPolyTrader', contracts.polygon.trader);

  // Check USDC balance
  const balance = await usdc.balanceOf(signer.address);
  console.log(`\nUSDC Balance: ${ethers.utils.formatUnits(balance, 6)} USDC`);

  if (balance.lt(maxPrice)) {
    throw new Error('Insufficient USDC balance for purchase');
  }

  // Approve USDC spend
  console.log('\nApproving USDC spend...');
  const approveTx = await usdc.approve(trader.address, maxPrice);
  console.log(`Approval tx hash: ${approveTx.hash}`);
  await approveTx.wait();
  console.log('USDC spend approved');

  // Buy position
  console.log('\nBuying position...');
  const tx = await trader.buyPosition(tokenId, amount, maxPrice);
  console.log(`Transaction hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log('Transaction confirmed');

  // Verify purchase
  const orderExecutedEvent = receipt.events?.find(e => e.event === 'OrderExecuted');
  if (orderExecutedEvent) {
    console.log('\nOrder details:');
    console.log(`Token ID: ${orderExecutedEvent.args.tokenId}`);
    console.log(`Amount: ${ethers.utils.formatUnits(orderExecutedEvent.args.amount, 6)}`);
    console.log(`Price paid: ${ethers.utils.formatUnits(orderExecutedEvent.args.price, 6)} USDC`);
  }

  console.log('\nPosition purchase completed!');
  console.log(`Run verification with:\nnpx hardhat run scripts/verify-purchase.ts --network polygon`);
}

buyPosition()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });