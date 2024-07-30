// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UsernameRegistry {
    mapping(string => address) public usernameToAddress;
    mapping(address => string) public addressToUsername;

    event UsernameRegistered(string username, address indexed user);

    function registerUsername(string memory username) public {
        string memory lowercaseUsername = toLowerCase(username);
        require(bytes(lowercaseUsername).length > 0, "Username cannot be empty");
        require(bytes(lowercaseUsername).length <= 24, "Username too long");
        require(usernameToAddress[lowercaseUsername] == address(0), "Username already taken");
        require(bytes(addressToUsername[msg.sender]).length == 0, "Address already has a username");
        require(isValidUsername(lowercaseUsername), "Username contains invalid characters");

        usernameToAddress[lowercaseUsername] = msg.sender;
        addressToUsername[msg.sender] = lowercaseUsername;
        emit UsernameRegistered(lowercaseUsername, msg.sender);
    }

    function getAddressByUsername(string memory username) public view returns (address) {
        return usernameToAddress[toLowerCase(username)];
    }

    function getUsernameByAddress(address user) public view returns (string memory) {
        return addressToUsername[user];
    }

    function isValidUsername(string memory str) internal pure returns (bool) {
        bytes memory b = bytes(str);
        for (uint i; i < b.length; i++) {
            bytes1 char = b[i];
            if (!(char >= 0x30 && char <= 0x39) && //0-9
                !(char >= 0x61 && char <= 0x7A)) //a-z
                return false;
        }
        return true;
    }

    function toLowerCase(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }
}