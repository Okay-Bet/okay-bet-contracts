use starknet::{ContractAddress, contract_address_const};
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};

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
    // Deploy contract
    let contract = declare("ParlayToken");
    let contract_class = contract.unwrap().contract_class();
    
    // Create addresses 
    let recipient: ContractAddress = contract_address_const::<'RECIPIENT'>();
    let owner: ContractAddress = contract_address_const::<'OWNER'>();
    
    // Deploy with constructor arguments in an array
    let mut calldata = ArrayTrait::new();
    calldata.append(owner.into());
    
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    
    // Create dispatcher to interact with token
    let erc20 = IERC20Dispatcher { contract_address };
    
    // Check initial supply is 0
    let initial_supply = erc20.total_supply();
    assert(initial_supply == 0, 'Initial supply should be 0');

    // Check recipient balance is 0
    let recipient_balance = erc20.balance_of(recipient);
    assert(recipient_balance == 0, 'Recipient should have 0');
}

#[test]
fn test_betslip_deployment() {
    // Create test addresses
    let owner = contract_address_const::<'OWNER'>();
    let recipient = contract_address_const::<'RECIPIENT'>();

    let contract = declare("Betslip").unwrap().contract_class();

    // Deploy with constructor arguments
    let constructor_args = array![
        owner.into(),     // owner address
    ];

    let (contract_address, _) = contract.deploy(@constructor_args).unwrap();
    
    let dispatcher = IERC721Dispatcher { contract_address };
    
    // Test initial state
    let name = dispatcher.name();
    assert(name == 'Betslip', 'Wrong name');
    
    let symbol = dispatcher.symbol();
    assert(symbol == 'BET', 'Wrong symbol');
    
    let total_supply = dispatcher.total_supply();
    assert(total_supply == 0, 'Initial supply should be 0');
    
    let balance = dispatcher.balance_of(recipient);
    assert(balance == 0, 'Recipient should have 0 NFTs');
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