// deploy/01-polymarket.ts
import assert from 'assert'
import { type DeployFunction } from 'hardhat-deploy/types'
import { EndpointId } from '@layerzerolabs/lz-definitions'

const deploy: DeployFunction = async (hre) => {
    const { getNamedAccounts, deployments } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    // Get the LayerZero endpoint address
    const endpointV2Deployment = await hre.deployments.get('EndpointV2')

    // Get network-specific configuration
    const config = getNetworkConfig(hre.network.name)
    assert(config, `Missing configuration for network ${hre.network.name}`)

    // Deploy Position Manager
    const positionManager = await deploy('PolymarketPositionManager', {
        from: deployer,
        args: [
            config.exchange,
            config.ctf,
            config.usdc,
            deployer, // signer
            deployer, // owner
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })
    console.log(`PositionManager deployed to: ${positionManager.address}`)

    // Deploy LayerZero Trader
    const trader = await deploy('LayerZeroPolyTrader', {
        from: deployer,
        args: [
            positionManager.address,
            config.stargate,
            config.usdc,
            config.remoteEndpointId,
            deployer, // owner
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })
    console.log(`LayerZeroTrader deployed to: ${trader.address}`)

    // Setup roles if newly deployed
    if (positionManager.newlyDeployed) {
        const PositionManager = await hre.ethers.getContractFactory('PolymarketPositionManager')
        const positionManagerContract = PositionManager.attach(positionManager.address)
        const TRADER_ROLE = await positionManagerContract.TRADER_ROLE()
        await positionManagerContract.grantRole(TRADER_ROLE, trader.address)
        console.log(`Granted TRADER_ROLE to ${trader.address}`)
    }

    return { positionManager: positionManager.address, trader: trader.address }
}

interface NetworkConfig {
    stargate: string
    usdc: string
    exchange: string
    ctf: string
    remoteEndpointId: number
}

function getNetworkConfig(network: string): NetworkConfig {
    const configs: Record<string, NetworkConfig> = {
        optimism: {
            stargate: '0x701a95707A0290AC8B90b3719e8EE5b210360883',
            usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
            exchange: '0x4eA49B60c35B25c0D181D82959ae238C55FaD5e1',
            ctf: '0x37595FCaF29E4fBAc0f7C1863E3dF2Fe6e2247e9',
            remoteEndpointId: EndpointId.POLYGON_V2_MAINNET,
        },
        polygon: {
            stargate: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
            usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            exchange: '0x4eA49B60c35B25c0D181D82959ae238C55FaD5e1',
            ctf: '0x37595FCaF29E4fBAc0f7C1863E3dF2Fe6e2247e9',
            remoteEndpointId: EndpointId.OPTIMISM_V2_MAINNET,
        },
    }
    return configs[network]
}

deploy.tags = ['PolymarketPositionManager', 'LayerZeroPolyTrader']
export default deploy
