Parlay Contract

deployed on starknet sepolia


## Parlay Contract

Central hub taking in user investments and issuing betslips

class hash: 0x011c57da9a850e0f17410ade1b8259976a75d91127be6f12e16af0daaf08989c
deploy address: 0x0574572d8a7e6d14eadbb934ea2bf45f61e6ddb0e4520daed63429129a5339b4

## fakeUSDC

usdc example token contract on sepolia

class hash: 0x020ae99610889c22b9948eb3b14b57f799e3b1faa9408af483d97e0e1f2ef68f
deployment address: 0x042838ee5b65fe9c5b24afd1f650f7e40564cc2d586a1d9ca8c4120456707d91
constructor:
    - recipient: 0x042838ee5b65fe9c5b24afd1f650f7e40564cc2d586a1d9ca8c4120456707d91
    - owner: 0x042838ee5b65fe9c5b24afd1f650f7e40564cc2d586a1d9ca8c4120456707d91

## parlayToken

Investment token that investors can exchange for liquidity in the the parlay contract

class hash: 0x0213f82611211894e025ff9fa56a5948f2a3c1b222074d963131d2a6f6870e1b
deployment address: 0x05d2e578458eaea7fc0386edd900beb1c2f81e71d5fb605d02d40e85032d1a88
constructor:
    - owner: 0x0574572d8a7e6d14eadbb934ea2bf45f61e6ddb0e4520daed63429129a5339b4

## Betslip

Nft minted to parlay bettor that entitles them to a payout if all of their selected events are correct.

class hash: 0x06d552684598e65b57d432388138a88320ea309c9c4af7c4be45afb6495f725f
deployment address: 0x05d3d026ef8672f010e1704097ab7e5130899a0c1b3a6f17e05d284dad0291e6
constructor:
    - owner: 0x0574572d8a7e6d14eadbb934ea2bf45f61e6ddb0e4520daed63429129a5339b4