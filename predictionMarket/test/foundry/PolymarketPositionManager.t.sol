// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/PolymarketPositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

contract MockExchange {
    IERC20 public usdc;
    IERC1155 public ctf;

    constructor(address _usdc, address _ctf) {
        usdc = IERC20(_usdc);
        ctf = IERC1155(_ctf);
    }

    function fillOrder(IExchange.Order calldata order) external {
        // Simulate exchange behavior
        if (order.side == 0) {
            // Buy
            require(usdc.transferFrom(order.maker, address(this), order.makerAmount), "USDC transfer failed");
            ctf.safeTransferFrom(address(this), order.maker, order.tokenId, order.takerAmount, "");
        } else {
            // Sell
            ctf.safeTransferFrom(order.maker, address(this), order.tokenId, order.makerAmount, "");
            require(usdc.transfer(order.maker, order.takerAmount), "USDC transfer failed");
        }
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function forceApprove(address spender, uint256 amount) external returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }
}

contract MockCTF is ERC1155 {
    mapping(bytes32 => bool) public isConditionPrepared;

    constructor() ERC1155("") {}

    function prepareCondition(address oracle, bytes32 questionId, uint outcomeSlotCount) external {
        bytes32 conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
        isConditionPrepared[conditionId] = true;
    }

    function mintTest(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

contract PolymarketPositionManagerTest is Test {
    PolymarketPositionManager public manager;
    MockUSDC public usdc;
    MockCTF public ctf;
    MockExchange public exchange;

    address public owner;
    address public trader;
    address public signer;

    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    bytes32 public constant TEST_QUESTION_ID = keccak256("Will ETH reach $5000 by end of 2024?");
    bytes32 public constant TEST_CONDITION_ID = keccak256(abi.encodePacked(address(0), TEST_QUESTION_ID, uint256(2)));
    uint256 public yesTokenId;
    uint256 public noTokenId;

    function setUp() public {
        owner = address(this);
        trader = address(0xB0B);
        signer = address(0xB0B1);

        usdc = new MockUSDC();
        ctf = new MockCTF();
        exchange = new MockExchange(address(usdc), address(ctf));

        manager = new PolymarketPositionManager(address(exchange), address(ctf), address(usdc), signer, owner);

        // Setup roles
        vm.startPrank(owner);
        manager.grantRole(TRADER_ROLE, trader);
        manager.grantRole(OPERATOR_ROLE, owner);
        vm.stopPrank();

        ctf.prepareCondition(address(0), TEST_QUESTION_ID, 2);
        (yesTokenId, noTokenId) = manager.getMarketTokenIds(TEST_CONDITION_ID);

        // Setup initial balances
        usdc.mint(address(manager), 10000 * 10 ** 6);
        usdc.mint(address(exchange), 10000 * 10 ** 6);
        usdc.mint(trader, 10000 * 10 ** 6);

        // Mint position tokens to exchange
        ctf.mintTest(address(exchange), yesTokenId, 10000 * 10 ** 6);
        ctf.mintTest(address(exchange), noTokenId, 10000 * 10 ** 6);

        // Approvals
        vm.startPrank(trader);
        usdc.forceApprove(address(ctf), type(uint256).max);
        usdc.forceApprove(address(manager), type(uint256).max);
        vm.stopPrank();

        // Manager approvals
        vm.startPrank(address(manager));
        ctf.setApprovalForAll(address(exchange), true);
        vm.stopPrank();
    }

    function test_InitialSetup() public {
        assertEq(manager.owner(), owner, "Incorrect owner");
        assertTrue(manager.hasRole(OPERATOR_ROLE, owner), "Owner should have operator role");
        assertTrue(manager.hasRole(TRADER_ROLE, trader), "Trader should have trader role");
        assertEq(address(manager.USDC()), address(usdc), "Incorrect USDC address");
        assertEq(address(manager.CTF()), address(ctf), "Incorrect CTF address");
        assertEq(address(manager.EXCHANGE()), address(exchange), "Incorrect exchange address");
    }

    function test_RoleManagement() public {
        address newTrader = address(0x123);

        vm.startPrank(owner);
        manager.grantRole(TRADER_ROLE, newTrader);
        assertTrue(manager.hasRole(TRADER_ROLE, newTrader), "New trader should have trader role");

        manager.revokeRole(TRADER_ROLE, newTrader);
        assertFalse(manager.hasRole(TRADER_ROLE, newTrader), "Trader role should be revoked");
        vm.stopPrank();
    }

    function test_CreateOrder() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        vm.startPrank(trader);
        IExchange.Order memory order = manager.createOrder(yesTokenId, amount, price, true);
        vm.stopPrank();

        assertEq(order.maker, address(manager), "Incorrect maker address");
        assertEq(order.tokenId, yesTokenId, "Incorrect token ID");
        assertEq(order.makerAmount, (amount * price) / 10 ** 6, "Incorrect maker amount");
        assertEq(order.side, 0, "Incorrect order side");
    }

    function test_BuyPosition() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        uint256 initialManagerUSDC = usdc.balanceOf(address(manager));
        uint256 initialTraderTokens = ctf.balanceOf(trader, yesTokenId);

        vm.startPrank(trader);
        manager.buyPosition(yesTokenId, amount, price);
        vm.stopPrank();

        assertEq(
            usdc.balanceOf(address(manager)),
            initialManagerUSDC - ((amount * price) / 10 ** 6),
            "Incorrect USDC balance after buy"
        );
        assertEq(
            ctf.balanceOf(address(manager), yesTokenId),
            initialTraderTokens + amount,
            "Incorrect token balance after buy"
        );
    }

    function test_SellPosition() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        ctf.mintTest(address(manager), yesTokenId, amount);

        uint256 initialManagerTokens = ctf.balanceOf(address(manager), yesTokenId);
        uint256 initialManagerUSDC = usdc.balanceOf(address(manager));

        vm.startPrank(trader);
        manager.sellPosition(yesTokenId, amount, price);
        vm.stopPrank();

        assertEq(
            ctf.balanceOf(address(manager), yesTokenId),
            initialManagerTokens - amount,
            "Incorrect token balance after sell"
        );
        assertEq(
            usdc.balanceOf(address(manager)),
            initialManagerUSDC + ((amount * price) / 10 ** 6),
            "Incorrect USDC balance after sell"
        );
    }

    function test_RevertInvalidAmount() public {
        vm.startPrank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(PolymarketPositionManager.InvalidAmount.selector, 0, "Amount must be greater than 0")
        );
        manager.buyPosition(yesTokenId, 0, 1 * 10 ** 6);
        vm.stopPrank();
    }

    function test_RevertUnauthorizedAccess() public {
        address unauthorized = address(0x999);
        vm.startPrank(unauthorized);

        // Use IAccessControl for the error definition
        bytes32 role = TRADER_ROLE;
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, unauthorized, role)
        );
        manager.buyPosition(yesTokenId, 100 * 10 ** 6, 0.5 * 10 ** 6);
        vm.stopPrank();
    }

    function test_RevertInsufficientBalance() public {
        uint256 amount = 1000000 * 10 ** 6; // More than minted amount
        uint256 price = 1 * 10 ** 6;

        vm.startPrank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                PolymarketPositionManager.InsufficientBalance.selector,
                (amount * price) / 10 ** 6,
                usdc.balanceOf(address(manager))
            )
        );
        manager.buyPosition(yesTokenId, amount, price);
        vm.stopPrank();
    }

    function test_TransferPosition() public {
        uint256 amount = 100 * 10 ** 6;
        address recipient = address(0x123);

        ctf.mintTest(address(manager), yesTokenId, amount);

        vm.startPrank(trader);
        manager.transferPosition(recipient, yesTokenId, amount);
        vm.stopPrank();

        assertEq(ctf.balanceOf(recipient, yesTokenId), amount, "Recipient should have received tokens");
    }

    function test_RevertTransferToZeroAddress() public {
        uint256 amount = 100 * 10 ** 6;

        vm.startPrank(trader);
        vm.expectRevert(abi.encodeWithSelector(PolymarketPositionManager.InvalidAddress.selector, "recipient"));
        manager.transferPosition(address(0), yesTokenId, amount);
        vm.stopPrank();
    }

    function test_UpdateSigner() public {
        address newSigner = address(0x777);

        vm.startPrank(owner);
        manager.setSignerAddress(newSigner);
        vm.stopPrank();

        assertEq(manager.signer(), newSigner, "Signer should be updated");
    }

    function test_RevertInvalidSigner() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(PolymarketPositionManager.InvalidAddress.selector, "signer"));
        manager.setSignerAddress(address(0));
        vm.stopPrank();
    }

    receive() external payable {}
}
