// parlay contract
// this contract raises investment funds in USDC and mints parlay tokens
// the contract also creates betslips to traders

// more to come!


#[starknet::contract]
mod ParlayContract{
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use crate::parlayToken::{ImyMintDispatcher, ImyMintDispatcherTrait};
    use crate::betslip::{IbetMintDispatcher, IbetMintDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry};
    use starknet::ContractAddress;
    use starknet::storage::Map;


    #[storage]
    struct Storage {
        usdc_address: ContractAddress,
        parlay_token_address: ContractAddress,
        betslip_address: ContractAddress,
        markets: Map<felt252, u32 >, 
        committed_capital: u256,
        betslip_counter: u256,
    }

    // set the committed capital to 0 when contract initializes
    // #[constructor]
    // fn constructor(ref self: Storage) {
    //     self.committed_capital = 0;
    // }

    // event when betslip is minted
    // idk how to do this yet
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {

    }



    #[generate_trait]
    #[abi(per_item)]
    impl ExternalImpl of ExternalTrait {

        // Check money in the contract
        #[external(v0)]
        fn get_total_capital(self: @ContractState) -> u256 {
        // get the total capital of the contract
            let usdc_dispatcher = IERC20Dispatcher{contract_address: self.usdc_address.read()};
            let total_capital = usdc_dispatcher.balance_of(starknet::get_contract_address());
            return total_capital;
        }

        // finding interface token contracts
        #[external(v0)]
        fn set_config(ref self: ContractState, usdc_address: ContractAddress, parlay_token_address: ContractAddress, betslip_address: ContractAddress) {
            self.usdc_address.write(usdc_address);
            self.parlay_token_address.write(parlay_token_address);
            self.betslip_address.write(betslip_address);
        }

        //invest token in the parlay token
        #[external(v0)]
        fn invest(ref self: ContractState, value: u256) {
            let usdc_dispatcher = IERC20Dispatcher{contract_address: self.usdc_address.read()};
            usdc_dispatcher.transfer_from(starknet::get_caller_address(), starknet::get_contract_address(), value);

            let parlay_dispatcher = ImyMintDispatcher{contract_address: self.parlay_token_address.read()};
            parlay_dispatcher.mint(starknet::get_caller_address(), value);
        }

        // create a betslip
        #[external(v0)]
        fn create_betslip(ref self: ContractState, market_hash: felt252, end_date: u32, bet_amount: u256) {
            
            // check that there is enough reserves
            let committed_capital = self.committed_capital.read();
            let reserves = self.get_total_capital() - committed_capital;
            assert(reserves <= bet_amount, 'Not enough reserves');

            // if their is enough margin, take usdc from the caller
            let usdc_dispatcher = IERC20Dispatcher{contract_address: self.usdc_address.read()};
            usdc_dispatcher.transfer_from(starknet::get_caller_address(), starknet::get_contract_address(), bet_amount);

            // mint the betslip, send it to the caller
            let betslip_dispatcher = IbetMintDispatcher{contract_address: self.betslip_address.read()};
                // get the markets map from the front end call
            self.markets.entry(market_hash).write(end_date);
                // token id should be enumreserveserated
            let tokenId = self.betslip_counter.read()+1; // wrong
            self.betslip_counter.write(tokenId);

            let data = array![market_hash, end_date.into()];

            betslip_dispatcher.safeMint(starknet::get_caller_address(), tokenId, data.span());

            // update the commited capital
            self.committed_capital.write(committed_capital+bet_amount);
        }   


    }


}