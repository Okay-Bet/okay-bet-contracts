// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/PolymarketPositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

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
            // Transfer USDC from maker to this contract
            require(usdc.transferFrom(order.maker, address(this), order.makerAmount), "USDC transfer failed");
            // Transfer position tokens from this contract to maker
            ctf.safeTransferFrom(address(this), order.maker, order.tokenId, order.takerAmount, "");
        } else {
            // Sell
            // Transfer position tokens from maker to this contract
            ctf.safeTransferFrom(order.maker, address(this), order.tokenId, order.makerAmount, "");
            // Transfer USDC from this contract to maker
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
}

contract MockCTF is ERC1155 {
    mapping(bytes32 => bool) public isConditionPrepared;

    constructor() ERC1155("") {}

    function prepareCondition(address oracle, bytes32 questionId, uint outcomeSlotCount) external {
        bytes32 conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
        isConditionPrepared[conditionId] = true;
    }

    function splitPosition(
        IERC20 collateral,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint[] calldata partition,
        uint amount
    ) external {
        require(isConditionPrepared[conditionId], "Condition not prepared");
        require(collateral.transferFrom(msg.sender, address(this), amount), "Collateral transfer failed");

        for (uint i = 0; i < partition.length; i++) {
            bytes32 collectionId = keccak256(abi.encodePacked(parentCollectionId, conditionId, partition[i]));
            uint256 positionId = uint256(keccak256(abi.encodePacked(address(collateral), collectionId)));
            _mint(msg.sender, positionId, amount, "");
        }
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

        // Update constructor call to include owner
        manager = new PolymarketPositionManager(
            address(exchange),
            address(ctf),
            address(usdc),
            signer,
            owner // Pass owner as initialOwner
        );

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
        usdc.approve(address(ctf), type(uint256).max);
        usdc.approve(address(manager), type(uint256).max);
        vm.stopPrank();

        // Manager approvals
        vm.startPrank(address(manager));
        ctf.setApprovalForAll(address(exchange), true);
        vm.stopPrank();
    }

    function test_Ownership() public {
        assertEq(manager.owner(), owner, "Incorrect owner");
    }

    function test_AuthorizedTrader() public {
        address newTrader = address(0x123);

        vm.startPrank(owner);
        manager.setAuthorizedTrader(newTrader, true);
        vm.stopPrank();

        assertTrue(manager.authorizedTraders(newTrader), "Trader should be authorized");

        vm.startPrank(owner);
        manager.setAuthorizedTrader(newTrader, false);
        vm.stopPrank();

        assertFalse(manager.authorizedTraders(newTrader), "Trader should be unauthorized");
    }

    function test_CreateOrder() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        vm.startPrank(trader);
        IExchange.Order memory order = manager.createOrder(yesTokenId, amount, price, true);
        vm.stopPrank();

        assertEq(order.maker, address(manager));
        assertEq(order.tokenId, yesTokenId);
        assertEq(order.makerAmount, (amount * price) / 10 ** 6);
        assertEq(order.side, 0);
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

        // Mint position tokens directly to manager
        ctf.mintTest(address(manager), yesTokenId, amount);

        uint256 initialManagerTokens = ctf.balanceOf(address(manager), yesTokenId);
        uint256 initialManagerUSDC = usdc.balanceOf(address(manager));
        uint256 initialExchangeTokens = ctf.balanceOf(address(exchange), yesTokenId);
        uint256 initialExchangeUSDC = usdc.balanceOf(address(exchange));

        vm.startPrank(trader);
        manager.sellPosition(yesTokenId, amount, price);
        vm.stopPrank();

        // Check manager balances
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

        // Check exchange balances
        assertEq(
            ctf.balanceOf(address(exchange), yesTokenId),
            initialExchangeTokens + amount,
            "Incorrect exchange token balance after sell"
        );
        assertEq(
            usdc.balanceOf(address(exchange)),
            initialExchangeUSDC - ((amount * price) / 10 ** 6),
            "Incorrect exchange USDC balance after sell"
        );
    }

    function test_GetMarketTokenIds() public {
        (uint256 yes, uint256 no) = manager.getMarketTokenIds(TEST_CONDITION_ID);

        assertEq(yes, yesTokenId);
        assertEq(no, noTokenId);
    }

    function testFail_BuyPosition_InsufficientUSDC() public {
        uint256 amount = 1000000 * 10 ** 6; // 1M USDC
        uint256 price = 1 * 10 ** 6; // $1.00

        vm.startPrank(trader);
        manager.buyPosition(yesTokenId, amount, price);
        vm.stopPrank();
    }

    function testFail_SellPosition_InsufficientTokens() public {
        uint256 amount = 100 * 10 ** 6;
        uint256 price = 0.5 * 10 ** 6;

        vm.startPrank(trader);
        manager.sellPosition(yesTokenId, amount, price);
        vm.stopPrank();
    }

    receive() external payable {}
}
