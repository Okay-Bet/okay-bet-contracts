import { BetCreated as BetCreatedEvent } from "../generated/BetFactory/BetFactory";
import { BetCreated, Bet } from "../generated/schema";
import { Bet as BetTemplate } from "../generated/templates";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleBetCreated(event: BetCreatedEvent): void {
  let entity = new BetCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.betAddress = event.params.betAddress;
  entity.maker = event.params.maker;
  entity.taker = event.params.taker;
  entity.judge = event.params.judge;
  entity.totalWager = event.params.totalWager;
  entity.wagerRatio = event.params.wagerRatio;
  entity.conditions = event.params.conditions;
  entity.expirationBlock = event.params.expirationBlock;
  entity.wagerCurrency = event.params.wagerCurrency;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Create a new Bet entity
  let bet = new Bet(event.params.betAddress.toHexString());
  bet.betAddress = event.params.betAddress;
  bet.maker = event.params.maker;
  bet.taker = event.params.taker;
  bet.judge = event.params.judge;
  bet.totalWager = event.params.totalWager;
  bet.wagerRatio = event.params.wagerRatio;
  bet.conditions = event.params.conditions;
  bet.status = BigInt.fromI32(0); // Assuming 0 is Unfunded status
  bet.expirationBlock = event.params.expirationBlock;
  bet.finalized = false;
  bet.wagerCurrency = event.params.wagerCurrency;
  bet.createdAt = event.block.timestamp;
  bet.updatedAt = event.block.timestamp;
  bet.createdTxHash = event.transaction.hash;
  bet.save();

  // Create a new Bet template
  BetTemplate.create(event.params.betAddress);
}
