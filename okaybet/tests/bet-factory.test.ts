import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { BetCreated } from "../generated/schema"
import { BetCreated as BetCreatedEvent } from "../generated/BetFactory/BetFactory"
import { handleBetCreated } from "../src/bet-factory"
import { createBetCreatedEvent } from "./bet-factory-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let betAddress = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let better1 = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let better2 = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let decider = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let wager = BigInt.fromI32(234)
    let conditions = "Example string value"
    let newBetCreatedEvent = createBetCreatedEvent(
      betAddress,
      better1,
      better2,
      decider,
      wager,
      conditions
    )
    handleBetCreated(newBetCreatedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("BetCreated created and stored", () => {
    assert.entityCount("BetCreated", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "betAddress",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "better1",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "better2",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "decider",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "wager",
      "234"
    )
    assert.fieldEquals(
      "BetCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "conditions",
      "Example string value"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
