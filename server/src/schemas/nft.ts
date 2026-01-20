/**
 * nft.ts
 *
 * Zod schemas for NFT-related HTTP endpoints: collection fetch, wallet sync,
 * and mint. These validate wallet/card payloads before hitting services.
 */

import {z} from "zod";

const ethAddress = /^0x[a-fA-F0-9]{40}$/;

export const walletAddressSchema = z
    .string()
    .trim()
    .regex(ethAddress, {message: "Provide a valid wallet address."});

export const nftCollectionSchema = z.object({
    chainId: z.number().int().positive().optional(),
});

export const nftSyncSchema = z.object({
    chainId: z.number().int().positive().optional(),
    walletAddress: walletAddressSchema.optional(),
});

export const nftMintSchema = z.object({
    cardDefinitionId: z.string().trim().min(1, {message: "cardDefinitionId is required"}),
    chainId: z.number().int().positive().optional(),
});

export const nftMintPackSchema = z.object({
    count: z.number().int().positive().max(10).default(3),
    chainId: z.number().int().positive().optional(),
});
