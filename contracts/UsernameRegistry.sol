pragma solidity ^0.8.0;

contract UsernameRegistry {
    mapping(string => address) public usernameToAddress;
    mapping(address => string) public addressToUsername;

    event UsernameRegistered(string username, address indexed user);

    function registerUsername(string memory username) public {
        require(bytes(username).length > 0, "Username cannot be empty");
        require(usernameToAddress[username] == address(0), "Username already taken");
        require(bytes(addressToUsername[msg.sender]).length == 0, "Address already has a username");

        usernameToAddress[username] = msg.sender;
        addressToUsername[msg.sender] = username;

        emit UsernameRegistered(username, msg.sender);
    }

    function getAddressByUsername(string memory username) public view returns (address) {
        return usernameToAddress[username];
    }

    function getUsernameByAddress(address user) public view returns (string memory) {
        return addressToUsername[user];
    }
}