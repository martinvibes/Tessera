// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8, euint16, externalEuint8, externalEuint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TesseraID — soulbound institutional identity with encrypted KYB attributes
/// @notice One non-transferable token per institution. KYB tier, jurisdiction, and AUM bracket
///         are stored as FHE-encrypted handles; only the holder (and parties they whitelist)
///         can decrypt them.
contract TesseraID is ERC721, Ownable, ZamaEthereumConfig {
    error AlreadyAttested(address holder);
    error Soulbound();
    error NoToken();

    struct Attrs {
        euint8 tier;          // KYB tier 1..4
        euint16 jurisdiction; // ISO-3166 numeric country code
        euint8 aumBracket;    // bucket 1..5
    }

    uint256 private _nextId = 1;
    mapping(address holder => uint256 tokenId) public tokenIdOf;
    mapping(uint256 tokenId => Attrs) private _attrs;

    event Attested(address indexed holder, uint256 indexed tokenId);

    constructor(address initialOwner) ERC721("Tessera ID", "TID") Ownable(initialOwner) {}

    /// @notice Owner-only: mint a soulbound NFT representing an institution's encrypted KYB profile.
    function attest(
        address holder,
        externalEuint8 inputTier,
        bytes calldata tierProof,
        externalEuint16 inputJurisdiction,
        bytes calldata jurisdictionProof,
        externalEuint8 inputAumBracket,
        bytes calldata aumProof
    ) external onlyOwner returns (uint256 tokenId) {
        if (tokenIdOf[holder] != 0) revert AlreadyAttested(holder);

        euint8 tier = FHE.fromExternal(inputTier, tierProof);
        euint16 jurisdiction = FHE.fromExternal(inputJurisdiction, jurisdictionProof);
        euint8 aumBracket = FHE.fromExternal(inputAumBracket, aumProof);

        tokenId = _attestInternal(holder, tier, jurisdiction, aumBracket);
    }

    /// @notice Owner attests with cleartext inputs that get trivially encrypted on-chain.
    /// @dev For local-dev / demo paths where the Zama relayer infrastructure isn't reachable.
    ///      Production deployments should always use {attest} with externally-encrypted inputs.
    function attestClear(
        address holder,
        uint8 tier_,
        uint16 jurisdiction_,
        uint8 aumBracket_
    ) external onlyOwner returns (uint256 tokenId) {
        if (tokenIdOf[holder] != 0) revert AlreadyAttested(holder);

        euint8 tier = FHE.asEuint8(tier_);
        euint16 jurisdiction = FHE.asEuint16(jurisdiction_);
        euint8 aumBracket = FHE.asEuint8(aumBracket_);

        tokenId = _attestInternal(holder, tier, jurisdiction, aumBracket);
    }

    function _attestInternal(
        address holder,
        euint8 tier,
        euint16 jurisdiction,
        euint8 aumBracket
    ) internal returns (uint256 tokenId) {
        tokenId = _nextId++;
        tokenIdOf[holder] = tokenId;
        _attrs[tokenId] = Attrs(tier, jurisdiction, aumBracket);

        FHE.allowThis(tier);
        FHE.allowThis(jurisdiction);
        FHE.allowThis(aumBracket);
        FHE.allow(tier, holder);
        FHE.allow(jurisdiction, holder);
        FHE.allow(aumBracket, holder);

        _safeMint(holder, tokenId);
        emit Attested(holder, tokenId);
    }

    function tierOf(address holder) external view returns (euint8) {
        return _attrs[tokenIdOf[holder]].tier;
    }

    function jurisdictionOf(address holder) external view returns (euint16) {
        return _attrs[tokenIdOf[holder]].jurisdiction;
    }

    function aumBracketOf(address holder) external view returns (euint8) {
        return _attrs[tokenIdOf[holder]].aumBracket;
    }

    /// @notice Holder grants a third party (e.g. ComplianceOracle) read access to its attrs.
    function shareAttrsWith(address reader) external {
        uint256 tokenId = tokenIdOf[msg.sender];
        if (tokenId == 0) revert NoToken();
        Attrs storage a = _attrs[tokenId];
        FHE.allow(a.tier, reader);
        FHE.allow(a.jurisdiction, reader);
        FHE.allow(a.aumBracket, reader);
    }

    /// @notice Soulbound: only mint and burn allowed (no peer-to-peer transfers).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
