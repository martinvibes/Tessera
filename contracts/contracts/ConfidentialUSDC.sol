// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfidentialUSDC — mock confidential USDC stablecoin (ERC-7984)
contract ConfidentialUSDC is ERC7984, Ownable, ZamaEthereumConfig {
    constructor(address initialOwner)
        ERC7984("Tessera Confidential USDC", "cUSDC", "")
        Ownable(initialOwner)
    {}

    function mintEncrypted(address to, externalEuint64 inputAmount, bytes calldata proof)
        external
        onlyOwner
        returns (euint64 minted)
    {
        minted = FHE.fromExternal(inputAmount, proof);
        _mint(to, minted);
    }
}
