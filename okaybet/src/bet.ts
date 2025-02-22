import {
  BetFunded as BetFundedEvent,
  BetStatusChanged as BetStatusChangedEvent,
  BetResolved as BetResolvedEvent,
  BetInvalidated as BetInvalidatedEvent,
} from "../generated/templates/Bet/Bet";
import { Bet, FundedAmount } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleBetFunded(event: BetFundedEvent): void {
  let bet = Bet.load(event.address.toHexString());
  if (bet) {
    bet.status = BigInt.fromI32(event.params.newStatus);
    bet.updatedAt = event.block.timestamp;
    bet.save();

    let fundedAmount = new FundedAmount(
      event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
    );
    fundedAmount.bet = bet.id;
    fundedAmount.bettor = event.params.funder;
    fundedAmount.amount = event.params.amount;
    fundedAmount.timestamp = event.block.timestamp;
    fundedAmount.save();
  }
}

export function handleBetStatusChanged(event: BetStatusChangedEvent): void {
  let bet = Bet.load(event.address.toHexString());
  if (bet) {
    bet.status = BigInt.fromI32(event.params.newStatus);
    bet.updatedAt = event.block.timestamp;
    bet.save();
  }
}

export function handleBetResolved(event: BetResolvedEvent): void {
  let bet = Bet.load(event.address.toHexString());
  if (bet) {
    bet.status = BigInt.fromI32(3); // Assuming 3 is Resolved status
    bet.winner = event.params.winner;
    bet.finalized = true;
    bet.updatedAt = event.block.timestamp;
    bet.save();
  }
}

export function handleBetInvalidated(event: BetInvalidatedEvent): void {
  let bet = Bet.load(event.address.toHexString());
  if (bet) {
    bet.status = BigInt.fromI32(4); // Assuming 4 is Invalidated status
    bet.finalized = true;
    bet.updatedAt = event.block.timestamp;
    bet.save();
  }
}
