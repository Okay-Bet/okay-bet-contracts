import { BetCreated as BetCreatedEvent } from "../generated/BetFactory/BetFactory"
import { BetCreated } from "../generated/schema"

export function handleBetCreated(event: BetCreatedEvent): void {
  let entity = new BetCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.betAddress = event.params.betAddress
  entity.better1 = event.params.better1
  entity.better2 = event.params.better2
  entity.decider = event.params.decider
  entity.wager = event.params.wager
  entity.conditions = event.params.conditions

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
