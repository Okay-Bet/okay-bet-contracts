use starknet::{ContractAddress, contract_address_const};
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

#[test]
fn test_fake_usdc_deployment() {
    // Create test addresses
    let recipient = contract_address_const::<'RECIPIENT'>();
    let owner = contract_address_const::<'OWNER'>();

    let contract = declare("FakeUSDC").unwrap().contract_class();

        // Deploy with constructor arguments
    let constructor_args = array![
        recipient.into(),  // recipient address
        owner.into(),     // owner address
    ];

    let (contract_address, _) = contract.deploy(@constructor_args).unwrap();
    
    let dispatcher = IERC20Dispatcher { contract_address };
    
    // Test initial supply was minted to recipient
    let balance = dispatcher.balance_of(recipient);
    assert(balance == 1000000000000000000000, 'Wrong initial supply');
}

#[test]
fn test_parlay_token_deployment() {
    let contract = declare("ParlayToken").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();

    let dispatcher = IERC20Dispatcher { contract_address };
    
    
    // Test initial supply is 0
    let total_supply = dispatcher.total_supply();
    assert(total_supply == 0, 'Initial supply should be 0');
}

// #[test]
// fn test_parlay_token_mint() {
//     let owner = contract_address_const::<'OWNER'>();
//     let recipient = contract_address_const::<'RECIPIENT'>();
//     let contract_address = deploy_parlay_token(owner);
//     let dispatcher = IERC20Dispatcher { contract_address };
    
//     // Start impersonating owner
//     start_prank(contract_address, owner);
    
//     // Mint tokens to recipient
//     let mint_amount: u256 = 1000000;
//     dispatcher.mint(recipient, mint_amount);
    
//     stop_prank(contract_address);
    
//     // Check recipient balance
//     let balance = dispatcher.balance_of(recipient);
//     assert(balance == mint_amount, 'Wrong balance after mint');
// }

// #[test]
// fn test_parlay_token_burn() {
//     let owner = contract_address_const::<'OWNER'>();
//     let user = contract_address_const::<'USER'>();
//     let contract_address = deploy_parlay_token(owner);
//     let dispatcher = IERC20Dispatcher { contract_address };
    
//     // Mint tokens first
//     start_prank(contract_address, owner);
//     dispatcher.mint(user, 1000000);
//     stop_prank(contract_address);
    
//     // Burn tokens
//     start_prank(contract_address, user);
//     let burn_amount: u256 = 500000;
//     dispatcher.burn(burn_amount);
//     stop_prank(contract_address);
    
//     // Check remaining balance
//     let balance = dispatcher.balance_of(user);
//     assert(balance == 500000, 'Wrong balance after burn');
// }