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
    signature: "event BetCreated(address indexed betAddress, address indexed maker, address indexed taker, address judge, uint256 totalWager, uint8 wagerRatio, string conditions, uint256 expirationBlock, address wagerCurrency)",
    filters,
  });
};
  

/**
* Contract read functions
*/



/**
 * Calls the "MIN_EXPIRATION_BLOCKS" function on the contract.
 * @param options - The options for the MIN_EXPIRATION_BLOCKS function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { MIN_EXPIRATION_BLOCKS } from "TODO";
 * 
 * const result = await MIN_EXPIRATION_BLOCKS();
 * 
 * ```
 */
export async function MIN_EXPIRATION_BLOCKS(
  options: BaseTransactionOptions
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x4f67bb5a",
  [],
  [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
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
 * Represents the parameters for the "createBet" function.
 */
export type CreateBetParams = {
  maker: AbiParameterToPrimitiveType<{"internalType":"address","name":"_maker","type":"address"}>
taker: AbiParameterToPrimitiveType<{"internalType":"address","name":"_taker","type":"address"}>
judge: AbiParameterToPrimitiveType<{"internalType":"address","name":"_judge","type":"address"}>
totalWager: AbiParameterToPrimitiveType<{"internalType":"uint256","name":"_totalWager","type":"uint256"}>
wagerRatio: AbiParameterToPrimitiveType<{"internalType":"uint8","name":"_wagerRatio","type":"uint8"}>
conditions: AbiParameterToPrimitiveType<{"internalType":"string","name":"_conditions","type":"string"}>
expirationBlocks: AbiParameterToPrimitiveType<{"internalType":"uint256","name":"_expirationBlocks","type":"uint256"}>
wagerCurrency: AbiParameterToPrimitiveType<{"internalType":"address","name":"_wagerCurrency","type":"address"}>
};

/**
 * Calls the "createBet" function on the contract.
 * @param options - The options for the "createBet" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { createBet } from "TODO";
 * 
 * const transaction = createBet({
 *  maker: ...,
 *  taker: ...,
 *  judge: ...,
 *  totalWager: ...,
 *  wagerRatio: ...,
 *  conditions: ...,
 *  expirationBlocks: ...,
 *  wagerCurrency: ...,
 * });
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function createBet(
  options: BaseTransactionOptions<CreateBetParams>
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0x64b7dc5f",
  [
    {
      "internalType": "address",
      "name": "_maker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_taker",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_judge",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "_totalWager",
      "type": "uint256"
    },
    {
      "internalType": "uint8",
      "name": "_wagerRatio",
      "type": "uint8"
    },
    {
      "internalType": "string",
      "name": "_conditions",
      "type": "string"
    },
    {
      "internalType": "uint256",
      "name": "_expirationBlocks",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_wagerCurrency",
      "type": "address"
    }
  ],
  []
],
    params: [options.maker, options.taker, options.judge, options.totalWager, options.wagerRatio, options.conditions, options.expirationBlocks, options.wagerCurrency]
  });
};


