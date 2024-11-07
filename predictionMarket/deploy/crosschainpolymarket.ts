// deploy/01-polymarket.ts
import assert from 'assert'
import { type DeployFunction } from 'hardhat-deploy/types'
import { ethers } from 'ethers'

const deploy: DeployFunction = async (hre) => {
    const { getNamedAccounts, deployments } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')
    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    // Get network-specific configuration
    const networkConfig = NETWORK_CONFIGS[hre.network.name as keyof typeof NETWORK_CONFIGS]
    if (!networkConfig) {
        throw new Error(`No configuration found for network: ${hre.network.name}`)
    }

    // Add network-specific salt to ensure different addresses
    const chainId = (await hre.ethers.provider.getNetwork()).chainId
    const salt = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(['uint256', 'string'], [chainId, networkConfig.chainName])
    )

    // Deploy Position Manager
    const positionManager = await deploy('PolymarketPositionManager', {
        from: deployer,
        args: [networkConfig.exchange, networkConfig.ctf, networkConfig.usdc, deployer, deployer],
        log: true,
        skipIfAlreadyDeployed: false,
        salt, // Add unique salt
    })
    console.log(`PositionManager deployed to: ${positionManager.address}`)

    // Deploy LayerZero Router
    const router = await deploy('LayerZeroPolyRouter', {
        from: deployer,
        args: [networkConfig.stargate, networkConfig.usdc, networkConfig.remoteEndpointId, deployer],
        log: true,
        skipIfAlreadyDeployed: false,
        salt, // Add unique salt
    })
    console.log(`LayerZeroRouter deployed to: ${router.address}`)

    // Deploy LayerZero Trader
    const trader = await deploy('LayerZeroPolyTrader', {
        from: deployer,
        args: [positionManager.address, networkConfig.stargate, networkConfig.usdc, deployer],
        log: true,
        skipIfAlreadyDeployed: false,
        salt, // Add unique salt
    })
    console.log(`LayerZeroTrader deployed to: ${trader.address}`)

    // Setup roles if newly deployed
    if (positionManager.newlyDeployed) {
        const PositionManager = await hre.ethers.getContractFactory('PolymarketPositionManager')
        const positionManagerContract = PositionManager.attach(positionManager.address)
        const TRADER_ROLE = await positionManagerContract.TRADER_ROLE()

        await positionManagerContract.grantRole(TRADER_ROLE, router.address)
        console.log(`Granted TRADER_ROLE to router at ${router.address}`)

        await positionManagerContract.grantRole(TRADER_ROLE, trader.address)
        console.log(`Granted TRADER_ROLE to trader at ${trader.address}`)
    }

    return {
        positionManager: positionManager.address,
        router: router.address,
        trader: trader.address,
    }
}

const NETWORK_CONFIGS = {
    optimism: {
        chainName: 'optimism',
        stargate: '0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0', 
        usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        exchange: '0x4eA49b60c35B25C0D181D82959ae238C55fAd5e1',
        ctf: '0x37595FCaF29E4fBAc0f7C1863E3dF2Fe6e2247e9',
        remoteEndpointId: 30111, 
    },
    polygon: {
        chainName: 'polygon',
        stargate: '0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4', 
        usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        exchange: '0x4eA49b60c35B25C0D181D82959ae238C55fAd5e1',
        ctf: '0x37595FCaF29E4fBAc0f7C1863E3dF2Fe6e2247e9',
        remoteEndpointId: 30109, 
    },
}

deploy.tags = ['PolymarketPositionManager', 'LayerZeroPolyRouter', 'LayerZeroPolyTrader']
export default deploy
