// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

interface IExchange {
    struct Order {
        uint256 salt;
        address maker;
        address signer;
        address taker;
        uint256 tokenId;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 expiration;
        uint256 nonce;
        uint256 feeRateBps;
        uint8 side;
        uint8 signatureType;
        bytes signature;
    }

    function fillOrder(Order calldata order) external;
}

contract PolymarketPositionManager is IERC1155Receiver, Ownable, AccessControl {
    // Custom errors
    error InsufficientBalance(uint256 required, uint256 available);
    error InvalidOrder(bytes32 orderHash, string reason);
    error UnauthorizedAccess(address caller, bytes32 requiredRole);
    error InvalidAddress(string parameter);
    error OrderExpired(uint256 expiration, uint256 currentTime);
    error InvalidAmount(uint256 amount, string reason);

    // State variables
    address public immutable EXCHANGE;
    address public immutable CTF;
    address public immutable USDC;
    address public signer;

    bytes32 public immutable DOMAIN_SEPARATOR;

    // Role definitions
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Order type hash for EIP712
    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)"
        );

    mapping(address => uint256) public nonces;

    // Events
    event OrderCreated(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    event OrderExecuted(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    );

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event AuthorizedTraderSet(address indexed trader, bool authorized);

    constructor(
        address _exchange,
        address _ctf,
        address _usdc,
        address _signer,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_exchange == address(0)) revert InvalidAddress("exchange");
        if (_ctf == address(0)) revert InvalidAddress("ctf");
        if (_usdc == address(0)) revert InvalidAddress("usdc");
        if (_signer == address(0)) revert InvalidAddress("signer");

        EXCHANGE = _exchange;
        CTF = _ctf;
        USDC = _usdc;
        signer = _signer;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PolymarketExchange"),
                keccak256("1"),
                block.chainid,
                EXCHANGE
            )
        );

        // Setup initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(OPERATOR_ROLE, initialOwner);

        // Approve Exchange contract to spend tokens
        IERC20(USDC).approve(EXCHANGE, type(uint256).max);
    }

    function createOrder(
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    ) public returns (IExchange.Order memory) {
        if (amount == 0) revert InvalidAmount(amount, "Amount must be greater than 0");
        if (price == 0) revert InvalidAmount(price, "Price must be greater than 0");

        uint256 salt = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
        uint256 expiration = block.timestamp + 1 hours;

        IExchange.Order memory order = IExchange.Order({
            salt: salt,
            maker: address(this),
            signer: signer,
            taker: address(0),
            tokenId: tokenId,
            makerAmount: isBuy ? (amount * price) / 1e6 : amount,
            takerAmount: isBuy ? amount : (amount * price) / 1e6,
            expiration: expiration,
            nonce: nonces[msg.sender]++,
            feeRateBps: 0,
            side: isBuy ? 0 : 1,
            signatureType: 0,
            signature: ""
        });

        bytes32 orderHash = getOrderHash(order);
        order.signature = signOrder(orderHash);

        emit OrderCreated(orderHash, msg.sender, tokenId, amount, price, isBuy);

        return order;
    }

    function getOrderHash(IExchange.Order memory order) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            ORDER_TYPEHASH,
                            order.salt,
                            order.maker,
                            order.signer,
                            order.taker,
                            order.tokenId,
                            order.makerAmount,
                            order.takerAmount,
                            order.expiration,
                            order.nonce,
                            order.feeRateBps,
                            order.side,
                            order.signatureType
                        )
                    )
                )
            );
    }

    function signOrder(bytes32 orderHash) internal view returns (bytes memory) {
        // In production this would use proper signatures
        // For testing, we'll just return a mock signature
        return abi.encodePacked(orderHash, signer);
    }

    function buyPosition(uint256 tokenId, uint256 amount, uint256 maxPrice) external onlyRole(TRADER_ROLE) {
        IExchange.Order memory order = createOrder(tokenId, amount, maxPrice, true);

        uint256 balance = IERC20(USDC).balanceOf(address(this));
        if (balance < order.makerAmount) {
            revert InsufficientBalance({ required: order.makerAmount, available: balance });
        }

        bytes32 orderHash = getOrderHash(order);
        IExchange(EXCHANGE).fillOrder(order);

        emit OrderExecuted(orderHash, msg.sender, tokenId, amount, maxPrice, true);
    }

    function sellPosition(uint256 tokenId, uint256 amount, uint256 minPrice) external onlyRole(TRADER_ROLE) {
        IExchange.Order memory order = createOrder(tokenId, amount, minPrice, false);

        uint256 balance = IERC1155(CTF).balanceOf(address(this), tokenId);
        if (balance < amount) {
            revert InsufficientBalance({ required: amount, available: balance });
        }

        bytes32 orderHash = getOrderHash(order);
        IExchange(EXCHANGE).fillOrder(order);

        emit OrderExecuted(orderHash, msg.sender, tokenId, amount, minPrice, false);
    }

    function getMarketTokenIds(bytes32 conditionId) public view returns (uint256, uint256) {
        uint256 yesTokenId = uint256(
            keccak256(abi.encodePacked(USDC, keccak256(abi.encodePacked(bytes32(0), conditionId, uint256(1)))))
        );

        uint256 noTokenId = uint256(
            keccak256(abi.encodePacked(USDC, keccak256(abi.encodePacked(bytes32(0), conditionId, uint256(2)))))
        );

        return (yesTokenId, noTokenId);
    }

    function setSignerAddress(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidAddress("signer");
        address oldSigner = signer;
        signer = _signer;
        emit SignerUpdated(oldSigner, _signer);
    }

    function transferPosition(address to, uint256 tokenId, uint256 amount) external onlyRole(TRADER_ROLE) {
        if (to == address(0)) revert InvalidAddress("recipient");
        if (amount == 0) revert InvalidAmount(amount, "Amount must be greater than 0");

        IERC1155(CTF).safeTransferFrom(address(this), to, tokenId, amount, "");
    }

    // ERC165 Implementation
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl, IERC165) returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ERC1155Receiver Implementation
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
