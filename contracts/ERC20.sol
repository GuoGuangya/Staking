// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// 通过质押平台的代币获取收益
contract Token is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {}

    function mint(uint256 value) external {
        // address account, uint256 value
        _mint(msg.sender, value);
    }
}
