// initialize contract


#[starknet::contract]
mod ParlayContract{
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::parlayToken::{ImyMintDispatcher, ImyMintDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::ContractAddress;
    use starknet::storage::Map;


    #[storage]
    struct Storage {
        usdc_address: ContractAddress,
        parlay_token_address: ContractAddress,
        // betslip_address: ContractAddress,
        markets: Map<felt252, u32 >, // hash of the market and end date
    }



    //functions to call
    #[generate_trait]
    #[abi(per_item)]
    impl ExternalImpl of ExternalTrait {
        #[external(v0)]
        fn set_config(ref self: ContractState, usdc_address: ContractAddress, parlay_token_address: ContractAddress) {
            self.usdc_address.write(usdc_address);
            self.parlay_token_address.write(parlay_token_address);
        }

        #[external(v0)]
        fn invest(ref self: ContractState, value: u256) {
            let usdc_dispatcher = IERC20Dispatcher{contract_address: self.usdc_address.read()};
            usdc_dispatcher.transfer(starknet::get_caller_address(), value);

            let parlay_dispatcher = ImyMintDispatcher{contract_address: self.parlay_token_address.read()};
            parlay_dispatcher.mint(starknet::get_caller_address(), value);
        }
    }
}