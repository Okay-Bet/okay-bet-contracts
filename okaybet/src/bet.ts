import {
  BetFunded as BetFundedEvent,
  BetStatusChanged as BetStatusChangedEvent,
  BetResolved as BetResolvedEvent,
  BetInvalidated as BetInvalidatedEvent,
} from "../generated/templates/Bet/Bet";
import { Bet, FundedAmount } from "../generated/schema";
import { BigInt, log } from "@graphprotocol/graph-ts";

export function handleBetFunded(event: BetFundedEvent): void {
  let betId = event.params.betAddress.toHexString();
  let bet = Bet.load(betId);
  if (bet == null) {
    log.error("Bet not found for BetFunded event. Bet ID: {}", [betId]);
    return;
  }

  let fundedAmountId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let fundedAmount = new FundedAmount(fundedAmountId);
  fundedAmount.bet = bet.id;
  fundedAmount.bettor = event.params.funder;
  fundedAmount.amount = event.params.amount;
  fundedAmount.timestamp = event.block.timestamp;
  fundedAmount.save();

  bet.status = BigInt.fromI32(event.params.newStatus);
  bet.updatedAt = event.block.timestamp;
  bet.save();

  log.info("Bet funded. Bet ID: {}, Funder: {}, Amount: {}", [
    betId,
    event.params.funder.toHexString(),
    event.params.amount.toString(),
  ]);
}

export function handleBetStatusChanged(event: BetStatusChangedEvent): void {
  let betId = event.params.betAddress.toHexString();
  let bet = Bet.load(betId);
  if (bet == null) {
    log.error("Bet not found for BetStatusChanged event. Bet ID: {}", [betId]);
    return;
  }

  bet.status = BigInt.fromI32(event.params.newStatus);
  bet.updatedAt = event.block.timestamp;
  bet.save();

  log.info("Bet status changed. Bet ID: {}, New Status: {}", [
    betId,
    event.params.newStatus.toString(),
  ]);
}

export function handleBetResolved(event: BetResolvedEvent): void {
  let betId = event.params.betAddress.toHexString();
  let bet = Bet.load(betId);
  if (bet == null) {
    log.error("Bet not found for BetResolved event. Bet ID: {}", [betId]);
    return;
  }

  bet.status = BigInt.fromI32(3); // Resolved
  bet.winner = event.params.winner;
  bet.finalized = true;
  bet.updatedAt = event.block.timestamp;
  bet.save();

  log.info("Bet resolved. Bet ID: {}, Winner: {}, Winning Amount: {}", [
    betId,
    event.params.winner.toHexString(),
    event.params.winningAmount.toString(),
  ]);
}

export function handleBetInvalidated(event: BetInvalidatedEvent): void {
  let betId = event.params.betAddress.toHexString();
  let bet = Bet.load(betId);
  if (bet == null) {
    log.error("Bet not found for BetInvalidated event. Bet ID: {}", [betId]);
    return;
  }

  bet.status = BigInt.fromI32(4); // Invalidated
  bet.finalized = true;
  bet.updatedAt = event.block.timestamp;
  bet.save();

  log.info("Bet invalidated. Bet ID: {}, Invalidator: {}, Reason: {}", [
    betId,
    event.params.invalidator.toHexString(),
    event.params.reason,
  ]);
}
