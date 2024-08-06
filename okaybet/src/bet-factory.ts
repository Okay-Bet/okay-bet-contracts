import { BetCreated as BetCreatedEvent } from "../generated/BetFactory/BetFactory"
import { BetCreated, Bet } from "../generated/schema"
import { Bet as BetTemplate } from "../generated/templates"

export function handleBetCreated(event: BetCreatedEvent): void {
  // Create BetCreated entity
  let betCreatedEntity = new BetCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  betCreatedEntity.betAddress = event.params.betAddress
  betCreatedEntity.better1 = event.params.better1
  betCreatedEntity.better2 = event.params.better2
  betCreatedEntity.decider = event.params.decider
  betCreatedEntity.wager = event.params.wager
  betCreatedEntity.conditions = event.params.conditions
  betCreatedEntity.blockNumber = event.block.number
  betCreatedEntity.blockTimestamp = event.block.timestamp
  betCreatedEntity.transactionHash = event.transaction.hash
  betCreatedEntity.save()

  // Create Bet entity
  let betEntity = new Bet(event.params.betAddress.toHexString())
  betEntity.betAddress = event.params.betAddress
  betEntity.better1 = event.params.better1
  betEntity.better2 = event.params.better2
  betEntity.decider = event.params.decider
  betEntity.wager = event.params.wager
  betEntity.conditions = event.params.conditions
  betEntity.status = 0 // Assuming 0 is the initial status (CREATED)
  betEntity.createdAt = event.block.timestamp
  betEntity.updatedAt = event.block.timestamp
  betEntity.createdTxHash = event.transaction.hash
  betEntity.save()

  // Create a new Bet template instance
  BetTemplate.create(event.params.betAddress)
}