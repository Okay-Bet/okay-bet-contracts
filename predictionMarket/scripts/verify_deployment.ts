// scripts/verify-deployment.ts
import { ethers } from 'hardhat';

async function verifyNetwork(networkName: string) {
  const deployment = {
    router: '0x5fdF4D925198DA8db32fb29635ec6f391B9f9819',
    trader: '0x49774C0d25Cb3B098162da5f3e53f3fd3026546C',
    positionManager: '0xF6D5BA5ECE7925277A63A7Dd96a46E93dE450381',
    expectedEndpointId: networkName === 'optimism' ? 40109 : 40132 // Polygon : Optimism
  };

  console.log(`\nVerifying ${networkName} configuration:`);
    
  // Get contract instances
  const router = await ethers.getContractAt('LayerZeroPolyRouter', deployment.router);
  const positionManager = await ethers.getContractAt('PolymarketPositionManager', deployment.positionManager);
    
  // Check endpoint configuration
  const dstEid = await router.dstEid();
  console.log(`\nRouter Configuration:`);
  console.log(`Current destination endpoint: ${dstEid}`);
  console.log(`Expected endpoint: ${deployment.expectedEndpointId}`);
  console.log(`Endpoint configuration correct: ${dstEid == deployment.expectedEndpointId}`);

  // Check TRADER_ROLE assignments
  const TRADER_ROLE = await positionManager.TRADER_ROLE();
  const routerHasRole = await positionManager.hasRole(TRADER_ROLE, deployment.router);
  const traderHasRole = await positionManager.hasRole(TRADER_ROLE, deployment.trader);
    
  console.log('\nRole Assignments:');
  console.log(`Router has TRADER_ROLE: ${routerHasRole}`);
  console.log(`Trader has TRADER_ROLE: ${traderHasRole}`);

  // Check USDC configuration
  const usdc = await router.usdc();
  console.log('\nUSDC Configuration:');
  console.log(`USDC address: ${usdc}`);
}

// Export the verification function
export async function verify(network: string) {
  await verifyNetwork(network);
}

// If running directly, verify both networks
if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      console.log('Starting verification...');
      await verify(process.env.HARDHAT_NETWORK || 'optimism');
    })
    .catch(console.error)
    .finally(() => process.exit());
}