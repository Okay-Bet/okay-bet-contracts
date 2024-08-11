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
 * Represents the filters for the "UsernameRegistered" event.
 */
export type UsernameRegisteredEventFilters = Partial<{
  user: AbiParameterToPrimitiveType<{"indexed":true,"internalType":"address","name":"user","type":"address"}>
}>;

/**
 * Creates an event object for the UsernameRegistered event.
 * @param filters - Optional filters to apply to the event.
 * @returns The prepared event object.
 * @example
 * ```
 * import { getContractEvents } from "thirdweb";
 * import { usernameRegisteredEvent } from "TODO";
 * 
 * const events = await getContractEvents({
 * contract,
 * events: [
 *  usernameRegisteredEvent({
 *  user: ...,
 * })
 * ],
 * });
 * ```
 */ 
export function usernameRegisteredEvent(filters: UsernameRegisteredEventFilters = {}) {
  return prepareEvent({
    signature: "event UsernameRegistered(string username, address indexed user)",
    filters,
  });
};
  

/**
* Contract read functions
*/

/**
 * Represents the parameters for the "addressToUsername" function.
 */
export type AddressToUsernameParams = {
  arg_0: AbiParameterToPrimitiveType<{"internalType":"address","name":"","type":"address"}>
};

/**
 * Calls the "addressToUsername" function on the contract.
 * @param options - The options for the addressToUsername function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { addressToUsername } from "TODO";
 * 
 * const result = await addressToUsername({
 *  arg_0: ...,
 * });
 * 
 * ```
 */
export async function addressToUsername(
  options: BaseTransactionOptions<AddressToUsernameParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xe07a0baa",
  [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  [
    {
      "internalType": "string",
      "name": "",
      "type": "string"
    }
  ]
],
    params: [options.arg_0]
  });
};


/**
 * Represents the parameters for the "getAddressByUsername" function.
 */
export type GetAddressByUsernameParams = {
  username: AbiParameterToPrimitiveType<{"internalType":"string","name":"username","type":"string"}>
};

/**
 * Calls the "getAddressByUsername" function on the contract.
 * @param options - The options for the getAddressByUsername function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getAddressByUsername } from "TODO";
 * 
 * const result = await getAddressByUsername({
 *  username: ...,
 * });
 * 
 * ```
 */
export async function getAddressByUsername(
  options: BaseTransactionOptions<GetAddressByUsernameParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0x6322961d",
  [
    {
      "internalType": "string",
      "name": "username",
      "type": "string"
    }
  ],
  [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ]
],
    params: [options.username]
  });
};


/**
 * Represents the parameters for the "getUsernameByAddress" function.
 */
export type GetUsernameByAddressParams = {
  user: AbiParameterToPrimitiveType<{"internalType":"address","name":"user","type":"address"}>
};

/**
 * Calls the "getUsernameByAddress" function on the contract.
 * @param options - The options for the getUsernameByAddress function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { getUsernameByAddress } from "TODO";
 * 
 * const result = await getUsernameByAddress({
 *  user: ...,
 * });
 * 
 * ```
 */
export async function getUsernameByAddress(
  options: BaseTransactionOptions<GetUsernameByAddressParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xed1a998d",
  [
    {
      "internalType": "address",
      "name": "user",
      "type": "address"
    }
  ],
  [
    {
      "internalType": "string",
      "name": "",
      "type": "string"
    }
  ]
],
    params: [options.user]
  });
};


/**
 * Represents the parameters for the "usernameToAddress" function.
 */
export type UsernameToAddressParams = {
  arg_0: AbiParameterToPrimitiveType<{"internalType":"string","name":"","type":"string"}>
};

/**
 * Calls the "usernameToAddress" function on the contract.
 * @param options - The options for the usernameToAddress function.
 * @returns The parsed result of the function call.
 * @example
 * ```
 * import { usernameToAddress } from "TODO";
 * 
 * const result = await usernameToAddress({
 *  arg_0: ...,
 * });
 * 
 * ```
 */
export async function usernameToAddress(
  options: BaseTransactionOptions<UsernameToAddressParams>
) {
  return readContract({
    contract: options.contract,
    method: [
  "0xf825f143",
  [
    {
      "internalType": "string",
      "name": "",
      "type": "string"
    }
  ],
  [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ]
],
    params: [options.arg_0]
  });
};


/**
* Contract write functions
*/

/**
 * Represents the parameters for the "registerUsername" function.
 */
export type RegisterUsernameParams = {
  username: AbiParameterToPrimitiveType<{"internalType":"string","name":"username","type":"string"}>
};

/**
 * Calls the "registerUsername" function on the contract.
 * @param options - The options for the "registerUsername" function.
 * @returns A prepared transaction object.
 * @example
 * ```
 * import { registerUsername } from "TODO";
 * 
 * const transaction = registerUsername({
 *  username: ...,
 * });
 * 
 * // Send the transaction
 * ...
 * 
 * ```
 */
export function registerUsername(
  options: BaseTransactionOptions<RegisterUsernameParams>
) {
  return prepareContractCall({
    contract: options.contract,
    method: [
  "0x36a94134",
  [
    {
      "internalType": "string",
      "name": "username",
      "type": "string"
    }
  ],
  []
],
    params: [options.username]
  });
};


