/**
 * siwe.ts
 *
 * Zod schemas for SIWE-style Web3 login endpoints. Validates Ethereum wallet
 * addresses, nonce and signature payloads before they reach the service layer.
 */

import {z} from "zod";

const ethAddress = /^0x[a-fA-F0-9]{40}$/;

export const siweChallengeSchema = z.object({
    walletAddress: z
        .string()
        .trim()
        .regex(ethAddress, {message: "Provide a valid wallet address."}),
    chainId: z.number().int().positive().optional(),
});

export const siweVerifySchema = z.object({
    walletAddress: z
        .string()
        .trim()
        .regex(ethAddress, {message: "Provide a valid wallet address."}),
    signature: z.string().trim().min(1, {message: "Signature is required."}),
    nonce: z.string().trim().min(8, {message: "Nonce is required."}),
    chainId: z.number().int().positive().optional(),
});
