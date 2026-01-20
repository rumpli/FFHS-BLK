/**
 * siwe.ts
 *
 * Service helpers for SIWE-style Web3 login: issue nonce challenges and verify
 * signatures. Uses EIP-4361-inspired message format but keeps implementation
 * lightweight for this project.
 */

import {randomBytes} from "crypto";
import {prisma} from "../db/prisma.js";
import {signAccessToken} from "./jwt.js";
import {siweChallengeSchema, siweVerifySchema} from "../schemas/siwe.js";
import {verifyMessage, getAddress} from "ethers";

const NONCE_BYTES = 16;
const NONCE_TTL_MINUTES = 10;

function buildSiweMessage(domain: string, address: string, nonce: string, chainId?: number) {
    const header = `${domain} wants you to sign in with your Ethereum account:`;
    const uri = domain;
    const version = "1";
    const statement = "Sign in to Towerlords";
    const resources = "";
    const chain = chainId ? `Chain ID: ${chainId}\n` : "";
    // Minimal EIP-4361 style message
    return `${header}\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: ${version}\n${chain}Nonce: ${nonce}\nResources:${resources}`.trim();
}

function randomNonce() {
    return randomBytes(NONCE_BYTES).toString("hex");
}

export async function issueSiweChallenge(raw: unknown, domain: string) {
    const {walletAddress, chainId} = siweChallengeSchema.parse(raw);
    const nonce = randomNonce();
    const issuedAt = new Date();

    await prisma.user.upsert({
        where: {walletAddress},
        update: {siweNonce: nonce, siweNonceIssuedAt: issuedAt},
        create: {
            username: walletAddress,
            email: `${walletAddress}@wallet`,
            passwordHash: "", // placeholder, not used for wallet login
            walletAddress,
            siweNonce: nonce,
            siweNonceIssuedAt: issuedAt,
        },
    });

    return {
        nonce,
        message: buildSiweMessage(domain, walletAddress, nonce, chainId),
    };
}

export async function verifySiweSignature(raw: unknown, domain: string) {
    const {walletAddress, signature, nonce, chainId} = siweVerifySchema.parse(raw);
    const user = await prisma.user.findUnique({where: {walletAddress}});
    if (!user || !user.siweNonce || user.siweNonce !== nonce) {
        throw new Error("INVALID_NONCE");
    }
    if (user.siweNonceIssuedAt) {
        const ageMinutes = (Date.now() - user.siweNonceIssuedAt.getTime()) / 60000;
        if (ageMinutes > NONCE_TTL_MINUTES) {
            throw new Error("NONCE_EXPIRED");
        }
    }

    const message = buildSiweMessage(domain, walletAddress, nonce, chainId);
    let recovered: string;
    try {
        recovered = await verifyMessage(message, signature);
    } catch {
        throw new Error("INVALID_SIGNATURE");
    }
    const normalized = getAddress(walletAddress);
    if (getAddress(recovered) !== normalized) {
        throw new Error("INVALID_SIGNATURE");
    }

    const updated = await prisma.user.update({
        where: {walletAddress},
        data: {siweNonce: null, siweNonceIssuedAt: null},
        select: {
            id: true,
            username: true,
            email: true,
            walletAddress: true,
            createdAt: true,
        },
    });

    const token = signAccessToken({sub: updated.id, username: updated.username, walletAddress: normalized});
    return {user: updated, token};
}
