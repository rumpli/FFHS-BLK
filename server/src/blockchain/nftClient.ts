/**
 * nftClient.ts
 *
 * Thin ethers v6 helper for interacting with an ERC721(-Enumerable) contract
 * deployed on a local Hardhat chain. Provides read/write handles plus a few
 * convenience methods for minting and enumerating wallet-owned tokenIds.
 */

import {Contract, Interface, JsonRpcProvider, Wallet} from "ethers";
import {Buffer} from "node:buffer";

function getEnv() {
    return {
        HARDHAT_RPC_URL: process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545",
        NFT_CONTRACT_ADDRESS: process.env.NFT_CONTRACT_ADDRESS || "",
        NFT_CHAIN_ID: process.env.NFT_CHAIN_ID || process.env.CHAIN_ID || "31337",
        MINTER_PRIVATE_KEY: process.env.MINTER_PRIVATE_KEY || "",
    };
}

const ERC721_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function cardDefinitionIdOf(uint256 tokenId) view returns (string)",
    "function mintCard(address to, string cardDefinitionId) returns (uint256)",
    "function safeMint(address to, string cardDefinitionId) returns (uint256)",
    "function mint(address to, string cardDefinitionId) returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const iface = new Interface(ERC721_ABI);

function requireContractAddress() {
    const {NFT_CONTRACT_ADDRESS} = getEnv();
    if (!NFT_CONTRACT_ADDRESS) throw new Error("NFT_CONTRACT_ADDRESS is not configured");
    return NFT_CONTRACT_ADDRESS;
}

function provider() {
    const {HARDHAT_RPC_URL, NFT_CHAIN_ID} = getEnv();
    return new JsonRpcProvider(HARDHAT_RPC_URL, Number(NFT_CHAIN_ID));
}

function readContract() {
    return new Contract(requireContractAddress(), ERC721_ABI, provider());
}

function writeContract() {
    const {MINTER_PRIVATE_KEY} = getEnv();
    if (!MINTER_PRIVATE_KEY || MINTER_PRIVATE_KEY.length < 10) throw new Error("MINTER_PRIVATE_KEY is not configured for minting");
    const signer = new Wallet(MINTER_PRIVATE_KEY, provider());
    return new Contract(requireContractAddress(), ERC721_ABI, signer);
}

async function listTokensWithEnumerable(contract: Contract, wallet: string) {
    const balance: bigint = await contract.balanceOf(wallet);
    const tokens: string[] = [];
    const fn = contract.getFunction("tokenOfOwnerByIndex");
    for (let i = 0n; i < balance; i++) {
        const tokenId: bigint = await fn(wallet, i);
        tokens.push(tokenId.toString());
    }
    return tokens;
}

async function extractTokenIdFromReceipt(contract: Contract, receipt: any): Promise<string | null> {
    for (const log of receipt?.logs ?? []) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "Transfer" && parsed?.args?.tokenId != null) {
                return parsed.args.tokenId.toString();
            }
        } catch {
        }
    }
    return null;
}

async function fetchMetadata(tokenUri: string | null): Promise<any | null> {
    if (!tokenUri) return null;
    if (tokenUri.startsWith("data:application/json")) {
        const payload = tokenUri.substring(tokenUri.indexOf(",") + 1);
        const decoded = tokenUri.includes(";base64")
            ? Buffer.from(payload, "base64").toString("utf8")
            : decodeURIComponent(payload);
        try {
            return JSON.parse(decoded);
        } catch {
            return null;
        }
    }
    if (tokenUri.trim().startsWith("{")) {
        try {
            return JSON.parse(tokenUri);
        } catch {
            return null;
        }
    }
    if (tokenUri.startsWith("http")) {
        try {
            const res = await fetch(tokenUri);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }
    return null;
}

export async function resolveCardDefinitionId(tokenUri: string | null, _tokenId: string): Promise<string | null> {
    const meta = await fetchMetadata(tokenUri);
    if (meta && typeof meta.cardDefinitionId === "string" && meta.cardDefinitionId.trim().length > 0) {
        return meta.cardDefinitionId.trim();
    }
    if (meta && Array.isArray(meta.attributes)) {
        const attr = meta.attributes.find((a: any) =>
            typeof a?.trait_type === "string" && a.trait_type.toLowerCase() === "carddefinitionid"
        );
        if (attr && typeof attr?.value === "string" && attr.value.trim().length > 0) {
            return attr.value.trim();
        }
    }
    // As a last resort, allow tokenId mapping if a deterministic mapping is desired later
    return null;
}

export async function listOwnedTokenIds(wallet: string): Promise<string[]> {
    const contract = readContract();
    try {
        contract.getFunction("tokenOfOwnerByIndex");
    } catch {
        throw new Error("Contract must implement ERC721Enumerable for wallet sync");
    }
    return listTokensWithEnumerable(contract, wallet);
}

export async function fetchTokenUri(tokenId: string): Promise<string | null> {
    const contract = readContract();
    try {
        const uri: string = await contract.tokenURI(tokenId);
        return uri ?? null;
    } catch {
        return null;
    }
}

function pickMintFunction(contract: Contract): string {
    for (const name of ["mintCard", "safeMint", "mint"]) {
        try {
            contract.getFunction(name);
            return name;
        } catch {
        }
    }
    throw new Error("No mint function found. Expected one of mintCard/safeMint/mint");
}

export async function mintCard(to: string, cardDefinitionId: string): Promise<{tokenId: string | null; txHash: string; tokenUri: string | null;}> {
    const contract = writeContract();
    const fn = pickMintFunction(contract);
    const tx = await (contract as any)[fn](to, cardDefinitionId);
    const receipt = await tx.wait();
    const tokenId = await extractTokenIdFromReceipt(contract, receipt);
    let tokenUri: string | null = null;
    if (tokenId) {
        try {
            const uri: string = await contract.tokenURI(tokenId);
            tokenUri = uri ?? null;
        } catch {
        }
    }
    return {tokenId, txHash: receipt?.hash ?? tx.hash, tokenUri};
}

export function allowlistedContract() {
    const {NFT_CONTRACT_ADDRESS, NFT_CHAIN_ID} = getEnv();
    return {address: NFT_CONTRACT_ADDRESS, chainId: Number(NFT_CHAIN_ID)};
}

export async function fetchCardDefinitionId(tokenId: string): Promise<string | null> {
    const contract = readContract();
    try {
        const val: string = await (contract as any).cardDefinitionIdOf(tokenId);
        return val || null;
    } catch {
        return null;
    }
}
