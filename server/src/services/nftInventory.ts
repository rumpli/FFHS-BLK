/**
 * nftInventory.ts
 *
 * Service helpers to sync ERC721 ownership into the database, merge DB and NFT
 * inventory views, and mint new NFT-backed cards for a user.
 */

import {prisma} from "../db/prisma.js";
import {allowlistedContract, fetchTokenUri, listOwnedTokenIds, mintCard, resolveCardDefinitionId, fetchCardDefinitionId} from "../blockchain/nftClient.js";
import {listOwnedPacks, mintPack as mintPackOnChain, openPackFor} from "../blockchain/packClient.js";

const prismaAny = prisma as any;
const STATUS_OWNED = "OWNED" as const;

function now() {
    return new Date();
}

async function ensureContractRecord() {
    const {address, chainId} = allowlistedContract();
    return prismaAny.nftContract?.upsert({
        where: {address},
        update: {chainId},
        create: {address, chainId},
    });
}

export async function getMergedCollection(userId: string) {
    const [dbInventory, nftOwnerships] = await Promise.all([
        prisma.cardInventory.findMany({where: {userId}}),
        prismaAny.nftOwnership?.findMany({
            where: {userId, status: STATUS_OWNED},
            include: {cardNft: {select: {cardDefinitionId: true, tokenId: true, level: true}}},
        }) ?? [],
    ]);

    const byCard = new Map<string, {dbQuantity: number; nftQuantity: number; tokens: Array<{tokenId: string; level: number}>}>();

    for (const inv of dbInventory) {
        const entry = byCard.get(inv.cardId) ?? {dbQuantity: 0, nftQuantity: 0, tokens: []};
        entry.dbQuantity += inv.quantity;
        byCard.set(inv.cardId, entry);
    }

    for (const own of nftOwnerships) {
        const cardId = own.cardNft.cardDefinitionId;
        if (!cardId) continue;
        const entry = byCard.get(cardId) ?? {dbQuantity: 0, nftQuantity: 0, tokens: []};
        entry.nftQuantity += 1;
        entry.tokens.push({tokenId: own.cardNft.tokenId, level: own.cardNft.level});
        byCard.set(cardId, entry);
    }

    return Array.from(byCard.entries()).map(([cardId, data]) => ({
        cardId,
        dbQuantity: data.dbQuantity,
        nftQuantity: data.nftQuantity,
        total: data.dbQuantity + data.nftQuantity,
        tokens: data.tokens,
    }));
}

export async function syncWalletInventory(userId: string, walletAddress: string) {
    if (!walletAddress) throw new Error("WALLET_REQUIRED");
    const contract = await ensureContractRecord();
    const tokenIds = await listOwnedTokenIds(walletAddress);

    for (const tokenId of tokenIds) {
        const existing = await prismaAny.cardNft?.findUnique({
            where: {contractId_tokenId: {contractId: contract.id, tokenId}},
        });

        const metadataUri = existing?.metadataUri ?? (await fetchTokenUri(tokenId));
        const cardDefinitionId = existing?.cardDefinitionId
            ?? (await resolveCardDefinitionId(metadataUri, tokenId))
            ?? (await fetchCardDefinitionId(tokenId));

        // If we still cannot resolve a cardDefinitionId, or it doesn't exist in DB, skip to avoid FK violations
        if (!cardDefinitionId) {
            continue;
        }
        const hasCard = await prisma.cardDefinition.findUnique({where: {id: cardDefinitionId}});
        if (!hasCard) {
            continue;
        }

        const cardNft = await prismaAny.cardNft?.upsert({
            where: {contractId_tokenId: {contractId: contract.id, tokenId}},
            update: {
                metadataUri,
                cardDefinitionId,
            },
            create: {
                contractId: contract.id,
                tokenId,
                metadataUri,
                cardDefinitionId,
            },
        });

        await prismaAny.nftOwnership?.upsert({
            where: {cardNftId: cardNft.id},
            update: {
                userId,
                walletAddress,
                status: STATUS_OWNED,
                lastVerifiedAt: now(),
            },
            create: {
                cardNftId: cardNft.id,
                userId,
                walletAddress,
                status: STATUS_OWNED,
                acquiredAt: now(),
                lastVerifiedAt: now(),
            },
        });
    }

    return getMergedCollection(userId);
}

export async function mintNftForUser(userId: string, cardDefinitionId: string) {
    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user || !user.walletAddress) throw new Error("WALLET_REQUIRED");

    const card = await prisma.cardDefinition.findUnique({where: {id: cardDefinitionId}});
    if (!card) throw new Error("CARD_NOT_FOUND");
    if (card.collectible === false) throw new Error("CARD_NOT_COLLECTIBLE");

    const contract = await ensureContractRecord();
    const minted = await mintCard(user.walletAddress, cardDefinitionId);
    if (!minted.tokenId) throw new Error("TOKEN_ID_UNKNOWN");

    const cardNft = await prismaAny.cardNft?.upsert({
        where: {contractId_tokenId: {contractId: contract.id, tokenId: minted.tokenId}},
        update: {
            metadataUri: minted.tokenUri,
            mintedTxHash: minted.txHash,
            cardDefinitionId,
        },
        create: {
            contractId: contract.id,
            tokenId: minted.tokenId,
            metadataUri: minted.tokenUri,
            mintedTxHash: minted.txHash,
            cardDefinitionId,
        },
    });

    await prismaAny.nftOwnership?.upsert({
        where: {cardNftId: cardNft.id},
        update: {
            userId,
            walletAddress: user.walletAddress,
            status: STATUS_OWNED,
            lastVerifiedAt: now(),
        },
        create: {
            cardNftId: cardNft.id,
            userId,
            walletAddress: user.walletAddress,
            status: STATUS_OWNED,
            acquiredAt: now(),
            lastVerifiedAt: now(),
        },
    });

    const collection = await getMergedCollection(userId);
    return {tokenId: minted.tokenId, txHash: minted.txHash, collection};
}

export async function listPacksForUser(userId: string, walletAddress: string) {
    if (!walletAddress) throw new Error("WALLET_REQUIRED");
    const packs = await listOwnedPacks(walletAddress);
    return packs.map((id) => ({packId: id}));
}

export async function mintPackForUser(userId: string, _count?: number) {
    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user || !user.walletAddress) throw new Error("WALLET_REQUIRED");
    const minted = await mintPackOnChain(user.walletAddress);
    const packs = await listPacksForUser(userId, user.walletAddress);
    return {packId: minted.packId, txHash: minted.txHash, packs};
}

export async function openPackForUser(userId: string, packId: string) {
    const user = await prisma.user.findUnique({where: {id: userId}});
    if (!user || !user.walletAddress) throw new Error("WALLET_REQUIRED");
    const opened = await openPackFor(user.walletAddress, packId);
    const items: Array<{tokenId: string; cardDefinitionId: string | null}> = [];
    for (const tokenId of opened.cardTokenIds ?? []) {
        const uri = await fetchTokenUri(tokenId).catch(() => null);
        const cardId = (await resolveCardDefinitionId(uri, tokenId)) ?? (await fetchCardDefinitionId(tokenId));
         items.push({tokenId, cardDefinitionId: cardId});
    }
    const collection = await syncWalletInventory(userId, user.walletAddress);
    const packs = await listPacksForUser(userId, user.walletAddress);
    return {cardTokenIds: opened.cardTokenIds, txHash: opened.txHash, packs, cards: collection, items};
}
