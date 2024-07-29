import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import { BetCreated } from "../generated/BetFactory/BetFactory"

export function createBetCreatedEvent(
  betAddress: Address,
  better1: Address,
  better2: Address,
  decider: Address,
  wager: BigInt,
  conditions: string
): BetCreated {
  let betCreatedEvent = changetype<BetCreated>(newMockEvent())

  betCreatedEvent.parameters = new Array()

  betCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "betAddress",
      ethereum.Value.fromAddress(betAddress)
    )
  )
  betCreatedEvent.parameters.push(
    new ethereum.EventParam("better1", ethereum.Value.fromAddress(better1))
  )
  betCreatedEvent.parameters.push(
    new ethereum.EventParam("better2", ethereum.Value.fromAddress(better2))
  )
  betCreatedEvent.parameters.push(
    new ethereum.EventParam("decider", ethereum.Value.fromAddress(decider))
  )
  betCreatedEvent.parameters.push(
    new ethereum.EventParam("wager", ethereum.Value.fromUnsignedBigInt(wager))
  )
  betCreatedEvent.parameters.push(
    new ethereum.EventParam("conditions", ethereum.Value.fromString(conditions))
  )

  return betCreatedEvent
}
