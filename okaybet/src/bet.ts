import { 
    BetCancelled,
    BetFullyFunded,
    BetFunded,
    BetInvalidated,
    BetResolved
  } from "../generated/templates/Bet/Bet"
  import { Bet } from "../generated/schema"
  
  export function handleBetCancelled(event: BetCancelled): void {
    let betId = event.address.toHexString()
    let bet = Bet.load(betId)
    
    if (bet) {
      bet.status = 5 // Canceled
      bet.updatedAt = event.block.timestamp
      bet.canceller = event.params.canceller
      bet.save()
    }
  }
  
  export function handleBetFullyFunded(event: BetFullyFunded): void {
    let betId = event.address.toHexString()
    let bet = Bet.load(betId)
    
    if (bet) {
      bet.status = 3 // Open
      bet.updatedAt = event.block.timestamp
      bet.save()
    }
  }
  
  export function handleBetFunded(event: BetFunded): void {
    let betId = event.address.toHexString()
    let bet = Bet.load(betId)
    
    if (bet) {
      if (bet.status == 0) {
        bet.status = 1 // Partially Funded (Better 1 has funded)
      } else if (bet.status == 1) {
        bet.status = 2 // Partially Funded (Better 2 has funded)
      }
      bet.updatedAt = event.block.timestamp
      bet.lastFunder = event.params.funder
      bet.lastFundedAmount = event.params.amount
      bet.save()
    }
  }
  
  export function handleBetInvalidated(event: BetInvalidated): void {
    let betId = event.address.toHexString()
    let bet = Bet.load(betId)
    
    if (bet) {
      bet.status = 6 // Invalidated
      bet.updatedAt = event.block.timestamp
      bet.save()
    }
  }
  
  export function handleBetResolved(event: BetResolved): void {
    let betId = event.address.toHexString()
    let bet = Bet.load(betId)
    
    if (bet) {
      bet.status = 4 // Resolved
      bet.winner = event.params.winner
      bet.updatedAt = event.block.timestamp
      bet.save()
    }
  }