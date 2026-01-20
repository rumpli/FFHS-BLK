import {Contract, Interface, JsonRpcProvider, Wallet} from "ethers";

function getEnv() {
    return {
        HARDHAT_RPC_URL: process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545",
        PACK_CONTRACT_ADDRESS: process.env.PACK_CONTRACT_ADDRESS || "",
        NFT_CHAIN_ID: process.env.NFT_CHAIN_ID || "31337",
        MINTER_PRIVATE_KEY: process.env.MINTER_PRIVATE_KEY || "",
    };
}

const ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function mintPack(address to) returns (uint256)",
    "function openPackFor(address owner, uint256 packId) returns (uint256[])",
    "event PackMinted(uint256 indexed packId, address indexed to)",
    "event PackOpened(uint256 indexed packId, address indexed owner, uint256[] cardTokenIds)",
];

const iface = new Interface(ABI);

function requireAddress() {
    const {PACK_CONTRACT_ADDRESS} = getEnv();
    if (!PACK_CONTRACT_ADDRESS) throw new Error("PACK_CONTRACT_ADDRESS is not configured");
    return PACK_CONTRACT_ADDRESS;
}

function provider() {
    const {HARDHAT_RPC_URL, NFT_CHAIN_ID} = getEnv();
    return new JsonRpcProvider(HARDHAT_RPC_URL, Number(NFT_CHAIN_ID));
}

function readContract() {
    return new Contract(requireAddress(), ABI, provider());
}

function writeContract() {
    const {MINTER_PRIVATE_KEY} = getEnv();
    if (!MINTER_PRIVATE_KEY || MINTER_PRIVATE_KEY.length < 10) throw new Error("MINTER_PRIVATE_KEY missing");
    const signer = new Wallet(MINTER_PRIVATE_KEY, provider());
    return new Contract(requireAddress(), ABI, signer);
}

async function listTokens(contract: Contract, wallet: string) {
    const balance: bigint = await contract.balanceOf(wallet);
    const tokens: string[] = [];
    for (let i = 0n; i < balance; i++) {
        const tokenId: bigint = await contract.tokenOfOwnerByIndex(wallet, i);
        tokens.push(tokenId.toString());
    }
    return tokens;
}

export async function listOwnedPacks(wallet: string): Promise<string[]> {
    const contract = readContract();
    return listTokens(contract, wallet);
}

export async function mintPack(to: string): Promise<{packId: string | null; txHash: string;}> {
    const contract = writeContract();
    const tx = await contract.mintPack(to, {gasLimit: 6_000_000});
    const receipt = await tx.wait();
    let packId: string | null = null;
    for (const log of receipt?.logs ?? []) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "PackMinted") {
                packId = parsed?.args?.packId?.toString() ?? null;
                break;
            }
        } catch {
        }
    }
    return {packId, txHash: receipt?.hash ?? tx.hash};
}

export async function openPackFor(owner: string, packId: string): Promise<{cardTokenIds: string[]; txHash: string;}> {
    const contract = writeContract();
    const tx = await contract.openPackFor(owner, packId, {gasLimit: 6_000_000});
    const receipt = await tx.wait();
    let cardIds: string[] = [];
    for (const log of receipt?.logs ?? []) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "PackOpened") {
                const arr = parsed?.args?.cardTokenIds as any;
                if (arr) cardIds = Array.from(arr).map((x: any) => x.toString());
                break;
            }
        } catch {
        }
    }
    return {cardTokenIds: cardIds, txHash: receipt?.hash ?? tx.hash};
}
