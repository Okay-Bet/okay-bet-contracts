import {
  prepareEvent,
  prepareContractCall,
  readContract,
  type BaseTransactionOptions,
  type AbiParameterToPrimitiveType,
} from "thirdweb";

/**
* Contract events
*/

/**
 * Represents the filters for the "BetCreated" event.
 */
export type BetCreatedEventFilters = Partial<{
  betAddress: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"betAddress","type":"address"}>
maker: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"maker","type":"address"}>
taker: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"taker","type":"address"}>
}>;

/**
 * Creates an event object for the BetCreated event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { betCreatedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  betCreatedEvent({
 *  betAddress: ...,
 *  maker: ...,
 *  taker: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function betCreatedEvent(filters: BetCreatedEventFilters = {}) {
  return prepareEvent({
    signature: "event BetCreated(address indexed betAddress, address indexed maker, address indexed taker, address judge, uint256 totalWager, uint8 wagerRatio, string conditions, uint64 creationTimestamp, uint32 expirationBlock)",
    filters,
  });
};
  

/**
 * Represents the filters for the "BetFunded" event.
 */
export type BetFundedEventFilters = Partial<{
  betAddress: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"betAddress","type":"address"}>
funder: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"funder","type":"address"}>
}>;

/**
 * Creates an event object for the BetFunded event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { betFundedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  betFundedEvent({
 *  betAddress: ...,
 *  funder: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function betFundedEvent(filters: BetFundedEventFilters = {}) {
  return prepareEvent({
    signature: "event BetFunded(address indexed betAddress, address indexed funder, uint256 amount, uint8 newStatus)",
    filters,
  });
};
  

/**
 * Represents the filters for the "BetInvalidated" event.
 */
export type BetInvalidatedEventFilters = Partial<{
  betAddress: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"betAddress","type":"address"}>
invalidator: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"invalidator","type":"address"}>
}>;

/**
 * Creates an event object for the BetInvalidated event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { betInvalidatedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  betInvalidatedEvent({
 *  betAddress: ...,
 *  invalidator: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function betInvalidatedEvent(filters: BetInvalidatedEventFilters = {}) {
  return prepareEvent({
    signature: "event BetInvalidated(address indexed betAddress, address indexed invalidator, string reason, uint64 invalidationTimestamp)",
    filters,
  });
};
  

/**
 * Represents the filters for the "BetResolved" event.
 */
export type BetResolvedEventFilters = Partial<{
  betAddress: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"betAddress","type":"address"}>
winner: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"winner","type":"address"}>
}>;

/**
 * Creates an event object for the BetResolved event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { betResolvedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  betResolvedEvent({
 *  betAddress: ...,
 *  winner: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function betResolvedEvent(filters: BetResolvedEventFilters = {}) {
  return prepareEvent({
    signature: "event BetResolved(address indexed betAddress, address indexed winner, uint256 winningAmount, uint64 resolutionTimestamp)",
    filters,
  });
};
  

/**
 * Represents the filters for the "BetStatusChanged" event.
 */
export type BetStatusChangedEventFilters = Partial<{
  betAddress: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"betAddress","type":"address"}>
oldStatus: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"enum Bet.BetStatus","name":"oldStatus","type":"uint8"}>
newStatus: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"enum Bet.BetStatus","name":"newStatus","type":"uint8"}>
}>;

/**
 * Creates an event object for the BetStatusChanged event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { betStatusChangedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  betStatusChangedEvent({
 *  betAddress: ...,
 *  oldStatus: ...,
 *  newStatus: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function betStatusChangedEvent(filters: BetStatusChangedEventFilters = {}) {
  return prepareEvent({
    signature: "event BetStatusChanged(address indexed betAddress, uint8 indexed oldStatus, uint8 indexed newStatus, uint64 timestamp)",
    filters,
  });
};
  

/**
 * Represents the filters for the "PayoutFailed" event.
 */
export type PayoutFailedEventFilters = Partial<{
  recipient: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"recipient","type":"address"}>
}>;

/**
 * Creates an event object for the PayoutFailed event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { payoutFailedEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  payoutFailedEvent({
 *  recipient: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function payoutFailedEvent(filters: PayoutFailedEventFilters = {}) {
  return prepareEvent({
    signature: "event PayoutFailed(address indexed recipient, uint256 amount)",
    filters,
  });
};
  

/**
* Contract read functions
*/



/**
 * Calls the "bet" function on the contract.
 * @param options - The options for the bet function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { bet } from "TODO";
 * 
 * const result = await bet();
 * 
 * ```
 */
export async function bet(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x11610c25",
  [],
  [
    {
      "internalType": "address",
      "name": "maker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "taker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "judge",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "totalWager",
      "type": "uint256"
    },
    {
      "internalType": "uint8",
      "name": "wagerRatio",
      "type": "uint8"
    },
    {
      "internalType": "string",
      "name": "conditions",
      "type": "string"
    },
    {
      "internalType": "enum Bet.BetStatus",
      "name": "status",
      "type": "uint8"
    },
    {
      "internalType": "address",
      "name": "winner",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "expirationBlock",
      "type": "uint256"
    },
    {
      "internalType": "bool",
      "name": "finalized",
      "type": "bool"
    },
    {
      "internalType": "address",
      "name": "wagerCurrency",
      "type": "address"
    }
  ]
],
    params: []
  });
};


/**
 * Represents the parameters for the "fundedAmount" function.
 */
export type FundedAmountParams = {
  arg_0: AbiParameterToPrimitiveType<{"internalType":"address","name":"","type":"address"}>
};

/**
 * Calls the "fundedAmount" function on the contract.
 * @param options - The options for the fundedAmount function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { fundedAmount } from "TODO";
 * 
 * const result = await fundedAmount({
 *  arg_0: ...,
 * });
 * 
 * ```
 */
export async function fundedAmount(
  options: BaseTransactionOptions<FundedAmountParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x4099d033",
  [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ]
],
    params: [options.arg_0]
  });
};




/**
 * Calls the "getBetDetails" function on the contract.
 * @param options - The options for the getBetDetails function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getBetDetails } from "TODO";
 * 
 * const result = await getBetDetails();
 * 
 * ```
 */
export async function getBetDetails(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x8a2fd029",
  [],
  [
    {
      "internalType": "address",
      "name": "maker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "taker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "judge",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "totalWager",
      "type": "uint256"
    },
    {
      "internalType": "uint8",
      "name": "wagerRatio",
      "type": "uint8"
    },
    {
      "internalType": "string",
      "name": "conditions",
      "type": "string"
    },
    {
      "internalType": "enum Bet.BetStatus",
      "name": "status",
      "type": "uint8"
    },
    {
      "internalType": "address",
      "name": "winner",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "expirationBlock",
      "type": "uint256"
    },
    {
      "internalType": "bool",
      "name": "finalized",
      "type": "bool"
    },
    {
      "internalType": "address",
      "name": "wagerCurrency",
      "type": "address"
    }
  ]
],
    params: []
  });
};




/**
 * Calls the "getBetStatus" function on the contract.
 * @param options - The options for the getBetStatus function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getBetStatus } from "TODO";
 * 
 * const result = await getBetStatus();
 * 
 * ```
 */
export async function getBetStatus(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x1fa859e8",
  [],
  [
    {
      "internalType": "enum Bet.BetStatus",
      "name": "",
      "type": "uint8"
    }
  ]
],
    params: []
  });
};




/**
 * Calls the "getBetWinner" function on the contract.
 * @param options - The options for the getBetWinner function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getBetWinner } from "TODO";
 * 
 * const result = await getBetWinner();
 * 
 * ```
 */
export async function getBetWinner(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xcc2d642b",
  [],
  [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ]
],
    params: []
  });
};


/**
 * Represents the parameters for the "getWagerAmount" function.
 */
export type GetWagerAmountParams = {
  bettor: AbiParameterToPrimitiveType<{"internalType":"address","name":"bettor","type":"address"}>
};

/**
 * Calls the "getWagerAmount" function on the contract.
 * @param options - The options for the getWagerAmount function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getWagerAmount } from "TODO";
 * 
 * const result = await getWagerAmount({
 *  bettor: ...,
 * });
 * 
 * ```
 */
export async function getWagerAmount(
  options: BaseTransactionOptions<GetWagerAmountParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xbb3b90e0",
  [
    {
      "internalType": "address",
      "name": "bettor",
      "type": "address"
    }
  ],
  [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ]
],
    params: [options.bettor]
  });
};




/**
 * Calls the "isBetFinalized" function on the contract.
 * @param options - The options for the isBetFinalized function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { isBetFinalized } from "TODO";
 * 
 * const result = await isBetFinalized();
 * 
 * ```
 */
export async function isBetFinalized(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xf702db11",
  [],
  [
    {
      "internalType": "bool",
      "name": "",
      "type": "bool"
    }
  ]
],
    params: []
  });
};


/**
* Contract write functions
*/



/**
 * Calls the "cancelBet" function on the contract.
 * @param options - The options for the "cancelBet" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { cancelBet } from "TODO";
 * 
 * const transaction = cancelBet();
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function cancelBet(
  options: BaseTransactionOptions
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0x7b6d79f1",
  [],
  []
],
    params: []
  });
};




/**
 * Calls the "checkExpiration" function on the contract.
 * @param options - The options for the "checkExpiration" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { checkExpiration } from "TODO";
 * 
 * const transaction = checkExpiration();
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function checkExpiration(
  options: BaseTransactionOptions
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0xd43f28fd",
  [],
  []
],
    params: []
  });
};


/**
 * Represents the parameters for the "fundBet" function.
 */
export type FundBetParams = {
  amount: AbiParameterToPrimitiveType<{"internalType":"uint256","name":"amount","type":"uint256"}>
};

/**
 * Calls the "fundBet" function on the contract.
 * @param options - The options for the "fundBet" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { fundBet } from "TODO";
 * 
 * const transaction = fundBet({
 *  amount: ...,
 * });
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function fundBet(
  options: BaseTransactionOptions<FundBetParams>
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0x3efa06d7",
  [
    {
      "internalType": "uint256",
      "name": "amount",
      "type": "uint256"
    }
  ],
  []
],
    params: [options.amount]
  });
};




/**
 * Calls the "invalidateBet" function on the contract.
 * @param options - The options for the "invalidateBet" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { invalidateBet } from "TODO";
 * 
 * const transaction = invalidateBet();
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function invalidateBet(
  options: BaseTransactionOptions
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0x2193f8b9",
  [],
  []
],
    params: []
  });
};


/**
 * Represents the parameters for the "resolveBet" function.
 */
export type ResolveBetParams = {
  winner: AbiParameterToPrimitiveType<{"internalType":"address","name":"_winner","type":"address"}>
};

/**
 * Calls the "resolveBet" function on the contract.
 * @param options - The options for the "resolveBet" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { resolveBet } from "TODO";
 * 
 * const transaction = resolveBet({
 *  winner: ...,
 * });
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function resolveBet(
  options: BaseTransactionOptions<ResolveBetParams>
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0xd0b8a361",
  [
    {
      "internalType": "address",
      "name": "_winner",
      "type": "address"
    }
  ],
  []
],
    params: [options.winner]
  });
};


