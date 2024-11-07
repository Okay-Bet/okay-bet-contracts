import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'

async function transferUSDC() {
    const USDC_DECIMALS = 6
    const AMOUNT = ethers.utils.parseUnits('0.05', USDC_DECIMALS)
    const PRICE = ethers.utils.parseUnits('1.25', USDC_DECIMALS)
    const TOKEN_ID = 1
    const GAS_LIMIT = 500000

    const contracts = {
        optimism: {
            router: '0x936E3c09A6EEb2B7AC38f7CBF0918686b541f183',
            usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            stargate: '0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0',
            positionManager: '0x2365Cc50774A121368b4837f3834ab34d12d4250',
            trader: '0xF0ea21574C62aa063D74848875A560f01F14A996',
        },
    }

    console.log('\n--- Starting USDC Transfer (Taxi Mode) ---')
    const signer = (await ethers.getSigners())[0]
    console.log(`Using account: ${signer.address}`)

    // Setup contracts
    const router = await ethers.getContractAt('LayerZeroPolyRouter', contracts.optimism.router)
    const usdc = await ethers.getContractAt('IERC20', contracts.optimism.usdc)

    try {
        // Get destination chain ID
        const dstEid = await router.dstEid()
        console.log('\nDestination chain ID:', dstEid.toString())

        // Calculate USDC amount
        const usdcAmount = AMOUNT.mul(PRICE).div(ethers.utils.parseUnits('1', USDC_DECIMALS))
        console.log('\nUSDC Amount Required:', ethers.utils.formatUnits(usdcAmount, USDC_DECIMALS))

        // Create LayerZero adapter params for taxi mode
        const adapterParams = ethers.utils.solidityPack(
            ['uint16', 'uint256'],
            [2, GAS_LIMIT] // Changed version to 2 for taxi mode
        )

        // Check balances and allowance
        const [usdcBalance, currentAllowance, ethBalance] = await Promise.all([
            usdc.balanceOf(signer.address),
            usdc.allowance(signer.address, contracts.optimism.router),
            signer.getBalance(),
        ])

        console.log('\nCurrent Balances:')
        console.log('USDC Balance:', ethers.utils.formatUnits(usdcBalance, USDC_DECIMALS))
        console.log('USDC Allowance:', ethers.utils.formatUnits(currentAllowance, USDC_DECIMALS))
        console.log('ETH Balance:', ethers.utils.formatEther(ethBalance))

        // Update allowance if needed
        if (currentAllowance.lt(usdcAmount)) {
            console.log('\nUpdating USDC allowance...')
            const approveTx = await usdc.approve(contracts.optimism.router, ethers.constants.MaxUint256)
            await approveTx.wait()
            console.log('USDC allowance updated')
        }

        // Use a fixed native fee for Optimism (we'll skip fee quote since it's failing)
        const nativeFee = ethers.utils.parseEther('0.002')
        console.log('\nUsing fixed native fee:', ethers.utils.formatEther(nativeFee), 'ETH')

        if (ethBalance.lt(nativeFee)) {
            throw new Error(
                `Insufficient ETH. Need ${ethers.utils.formatEther(nativeFee)} ETH but have ${ethers.utils.formatEther(ethBalance)} ETH`
            )
        }

        // Send transaction
        console.log('\nSending transaction...')
        console.log('Parameters:', {
            tokenId: TOKEN_ID,
            amount: ethers.utils.formatUnits(AMOUNT, USDC_DECIMALS),
            price: ethers.utils.formatUnits(PRICE, USDC_DECIMALS),
            adapterParams: ethers.utils.hexlify(adapterParams),
            nativeFee: ethers.utils.formatEther(nativeFee),
        })

        // Call sendBuyOrder directly without fee quote
        const tx = await router.sendBuyOrder(TOKEN_ID, AMOUNT, PRICE, adapterParams, {
            value: nativeFee,
            gasLimit: GAS_LIMIT,
        })

        console.log(`\nTransaction hash: ${tx.hash}`)
        console.log('Waiting for confirmation...')

        const receipt = await tx.wait()
        console.log('Transaction confirmed:', receipt.status === 1 ? 'Success' : 'Failed')

        if (receipt.status === 1) {
            const orderSentEvent = receipt.events?.find((e) => e.event === 'OrderSent')
            if (orderSentEvent) {
                console.log('\nOrder successfully sent:', {
                    messageHash: orderSentEvent.args.messageHash,
                    tokenId: orderSentEvent.args.tokenId.toString(),
                    amount: ethers.utils.formatUnits(orderSentEvent.args.amount, USDC_DECIMALS),
                    price: ethers.utils.formatUnits(orderSentEvent.args.price, USDC_DECIMALS),
                    usdcAmount: ethers.utils.formatUnits(orderSentEvent.args.usdcAmount, USDC_DECIMALS),
                })
            }
        }
    } catch (error: any) {
        console.error('\nOperation failed:', error)

        if (error.data) {
            try {
                const iface = new ethers.utils.Interface([
                    'error InvalidAmount(uint256,string)',
                    'error InsufficientNativeFee(uint256,uint256)',
                    'error StargateOperationFailed()',
                    'error InvalidAddress(string)',
                    'error RefundFailed()',
                    'error CrossChainOperationFailed(string)',
                    'error InvalidToken(address,address)',
                    'error UnauthorizedCaller(address,address)',
                ])
                const decodedError = iface.parseError(error.data)
                console.error('Decoded error:', {
                    name: decodedError.name,
                    args: decodedError.args,
                })
            } catch (e) {
                if (error.data) {
                    console.error('Raw error data:', error.data)
                }
            }
        }

        throw error
    }
}

transferUSDC()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
