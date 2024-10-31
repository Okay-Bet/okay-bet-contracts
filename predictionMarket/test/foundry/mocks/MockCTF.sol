// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockCTF is ERC1155 {
    mapping(bytes32 => bool) public isConditionPrepared;
    mapping(bytes32 => uint256) public outcomeSlotCount;

    constructor() ERC1155("") {}

    function prepareCondition(address oracle, bytes32 questionId, uint256 _outcomeSlotCount) external {
        bytes32 conditionId = keccak256(abi.encodePacked(oracle, questionId, _outcomeSlotCount));
        isConditionPrepared[conditionId] = true;
        outcomeSlotCount[conditionId] = _outcomeSlotCount;
    }

    function splitPosition(
        IERC20 collateral,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        require(isConditionPrepared[conditionId], "Condition not prepared");
        require(collateral.transferFrom(msg.sender, address(this), amount), "Collateral transfer failed");

        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = keccak256(abi.encodePacked(parentCollectionId, conditionId, partition[i]));
            uint256 positionId = uint256(keccak256(abi.encodePacked(address(collateral), collectionId)));
            _mint(msg.sender, positionId, amount, "");
        }
    }

    function mergePositions(
        IERC20 collateral,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        require(isConditionPrepared[conditionId], "Condition not prepared");

        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = keccak256(abi.encodePacked(parentCollectionId, conditionId, partition[i]));
            uint256 positionId = uint256(keccak256(abi.encodePacked(address(collateral), collectionId)));
            _burn(msg.sender, positionId, amount);
        }

        require(collateral.transfer(msg.sender, amount), "Collateral transfer failed");
    }

    function mintTest(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }

    function burnTest(address from, uint256 id, uint256 amount) external {
        _burn(from, id, amount);
    }
}
