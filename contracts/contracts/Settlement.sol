// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IConfidentialAdmin {
    function transferFromAdmin(address from, address to, uint64 amount)
        external
        returns (euint64);
}

/// @title Settlement — atomic delivery-versus-payment for Tessera's confidential tokens.
/// @notice Both sides of a swap sign an EIP-712-style `DvP` typed message
///         off-chain. Anyone (in practice the Tessera operator relay) submits
///         both signatures to {settleAtomic}, which verifies them and executes
///         the two-leg transfer in a single transaction. Either both legs
///         succeed or the entire transaction reverts.
/// @dev We use a chain-independent EIP-712 domain (omits `chainId` and
///      `verifyingContract`). This is the EIP-712 minimal domain — required
///      because Web3Auth MPC wallets sometimes refuse to sign typed data
///      whose `chainId` doesn't match the wallet's currently-connected chain,
///      and our contracts may be deployed on a chain the wallet hasn't bound
///      to. For mainnet deployments tie the domain back to chainId.
contract Settlement is ZamaEthereumConfig {
    using ECDSA for bytes32;

    bytes32 private constant DOMAIN_HASH = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version)"),
            keccak256(bytes("Tessera")),
            keccak256(bytes("1"))
        )
    );

    bytes32 private constant DVP_TYPEHASH = keccak256(
        "DvP(address seller,address buyer,address sellAsset,address buyAsset,uint64 sellAmount,uint64 buyAmount,uint64 nonce,uint256 deadline)"
    );

    /// @notice Whitelist of token addresses this Settlement may operate on.
    mapping(address => bool) public approvedAsset;
    /// @notice Replay protection — each digest can only be settled once.
    mapping(bytes32 => bool) public used;

    error Expired();
    error UnknownAsset();
    error SameAsset();
    error InvalidSellerSig();
    error InvalidBuyerSig();
    error AlreadySettled();

    event Settled(
        address indexed seller,
        address indexed buyer,
        address sellAsset,
        address buyAsset,
        uint64 sellAmount,
        uint64 buyAmount,
        bytes32 indexed digest
    );
    event AssetApproved(address indexed asset, bool approved);

    constructor(address tbill, address usdc) {
        approvedAsset[tbill] = true;
        approvedAsset[usdc] = true;
        emit AssetApproved(tbill, true);
        emit AssetApproved(usdc, true);
    }

    /// @notice Compute the EIP-712 digest the seller and buyer must sign.
    function digestFor(
        address seller,
        address buyer,
        address sellAsset,
        address buyAsset,
        uint64 sellAmount,
        uint64 buyAmount,
        uint64 nonce,
        uint256 deadline
    ) public pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                DVP_TYPEHASH,
                seller,
                buyer,
                sellAsset,
                buyAsset,
                sellAmount,
                buyAmount,
                nonce,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_HASH, structHash));
    }

    function settleAtomic(
        address seller,
        address buyer,
        address sellAsset,
        address buyAsset,
        uint64 sellAmount,
        uint64 buyAmount,
        uint64 nonce,
        uint256 deadline,
        bytes calldata sellerSig,
        bytes calldata buyerSig
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (!approvedAsset[sellAsset] || !approvedAsset[buyAsset]) revert UnknownAsset();
        if (sellAsset == buyAsset) revert SameAsset();

        bytes32 digest = digestFor(
            seller,
            buyer,
            sellAsset,
            buyAsset,
            sellAmount,
            buyAmount,
            nonce,
            deadline
        );
        if (used[digest]) revert AlreadySettled();
        used[digest] = true;

        if (digest.recover(sellerSig) != seller) revert InvalidSellerSig();
        if (digest.recover(buyerSig) != buyer) revert InvalidBuyerSig();

        // Atomic two-leg DvP. If either transferFromAdmin reverts, the whole
        // tx reverts and neither asset moves — this is the entire point.
        IConfidentialAdmin(sellAsset).transferFromAdmin(seller, buyer, sellAmount);
        IConfidentialAdmin(buyAsset).transferFromAdmin(buyer, seller, buyAmount);

        emit Settled(
            seller,
            buyer,
            sellAsset,
            buyAsset,
            sellAmount,
            buyAmount,
            digest
        );
    }

    /// @notice Settle an *open* offer — one where the seller signed
    ///         `buyer == address(0)` to allow any counterparty to take it.
    ///         The taker signs the same offer with their own address as buyer.
    ///         Both signatures are verified independently; the seller's
    ///         (buyer=0) digest is used for replay protection.
    function settleOpenOffer(
        address seller,
        address taker,
        address sellAsset,
        address buyAsset,
        uint64 sellAmount,
        uint64 buyAmount,
        uint64 nonce,
        uint256 deadline,
        bytes calldata sellerSig,
        bytes calldata takerSig
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (!approvedAsset[sellAsset] || !approvedAsset[buyAsset]) revert UnknownAsset();
        if (sellAsset == buyAsset) revert SameAsset();

        // Seller's digest has buyer = 0 (the offer is "open").
        bytes32 sellerDigest = digestFor(
            seller,
            address(0),
            sellAsset,
            buyAsset,
            sellAmount,
            buyAmount,
            nonce,
            deadline
        );
        if (used[sellerDigest]) revert AlreadySettled();
        used[sellerDigest] = true;
        if (sellerDigest.recover(sellerSig) != seller) revert InvalidSellerSig();

        // Taker signs the same terms with their own address as buyer — proves
        // they consented to be the counterparty for this exact offer.
        bytes32 takerDigest = digestFor(
            seller,
            taker,
            sellAsset,
            buyAsset,
            sellAmount,
            buyAmount,
            nonce,
            deadline
        );
        if (takerDigest.recover(takerSig) != taker) revert InvalidBuyerSig();

        // Atomic two-leg DvP.
        IConfidentialAdmin(sellAsset).transferFromAdmin(seller, taker, sellAmount);
        IConfidentialAdmin(buyAsset).transferFromAdmin(taker, seller, buyAmount);

        emit Settled(
            seller,
            taker,
            sellAsset,
            buyAsset,
            sellAmount,
            buyAmount,
            sellerDigest
        );
    }
}
