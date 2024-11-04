// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

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

contract PolymarketPositionManager is IERC1155Receiver, Ownable {
    // State variables
    address public immutable EXCHANGE;
    address public immutable CTF;
    address public immutable USDC;
    address public signer;

    bytes32 public immutable DOMAIN_SEPARATOR;

    // Order type hash for EIP712
    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)"
        );

    mapping(address => uint256) public nonces;
    mapping(address => bool) public authorizedTraders;

    constructor(
        address _exchange,
        address _ctf,
        address _usdc,
        address _signer,
        address initialOwner
    ) Ownable(initialOwner) {
        // Pass initialOwner to Ownable constructor
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

        // Approve Exchange contract to spend tokens
        IERC20(USDC).approve(EXCHANGE, type(uint256).max);
    }

    function createOrder(
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        bool isBuy
    ) public returns (IExchange.Order memory) {
        uint256 salt = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));

        IExchange.Order memory order = IExchange.Order({
            salt: salt,
            maker: address(this),
            signer: signer,
            taker: address(0),
            tokenId: tokenId,
            makerAmount: isBuy ? (amount * price) / 1e6 : amount,
            takerAmount: isBuy ? amount : (amount * price) / 1e6,
            expiration: block.timestamp + 1 hours,
            nonce: nonces[msg.sender]++,
            feeRateBps: 0,
            side: isBuy ? 0 : 1,
            signatureType: 0,
            signature: ""
        });

        bytes32 orderHash = getOrderHash(order);
        order.signature = signOrder(orderHash);

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

    // For testing, we'll use a simple signing mechanism
    function signOrder(bytes32 orderHash) internal view returns (bytes memory) {
        // In production this would use proper signatures
        // For testing, we'll just return a mock signature
        return abi.encodePacked(orderHash, signer);
    }

    function buyPosition(uint256 tokenId, uint256 amount, uint256 maxPrice) external {
        IExchange.Order memory order = createOrder(tokenId, amount, maxPrice, true);

        require(IERC20(USDC).balanceOf(address(this)) >= order.makerAmount, "Insufficient USDC");

        IExchange(EXCHANGE).fillOrder(order);
    }

    function sellPosition(uint256 tokenId, uint256 amount, uint256 minPrice) external {
        IExchange.Order memory order = createOrder(tokenId, amount, minPrice, false);

        require(IERC1155(CTF).balanceOf(address(this), tokenId) >= amount, "Insufficient position tokens");

        IExchange(EXCHANGE).fillOrder(order);
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
        signer = _signer;
    }

    // ERC165 Implementation
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
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

    // Add function to authorize/deauthorize traders
    function setAuthorizedTrader(address trader, bool authorized) external onlyOwner {
        authorizedTraders[trader] = authorized;
        emit AuthorizedTraderSet(trader, authorized);
    }

    // Transfer position function with authorization check
    function transferPosition(address to, uint256 tokenId, uint256 amount) external {
        require(authorizedTraders[msg.sender], "Unauthorized trader");
        IERC1155(CTF).safeTransferFrom(address(this), to, tokenId, amount, "");
    }

    event AuthorizedTraderSet(address indexed trader, bool authorized);
}
