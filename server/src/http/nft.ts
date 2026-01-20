/**
 * nft.ts
 *
 * HTTP routes for NFT-backed inventory: collection view, wallet sync, and mint.
 */

import type {FastifyInstance} from "fastify";
import {getUserFromRequest} from "../auth/httpAuth.js";
import {nftMintSchema, nftSyncSchema, nftMintPackSchema} from "../schemas/nft.js";
import {getMergedCollection, mintNftForUser, syncWalletInventory, mintPackForUser, listPacksForUser, openPackForUser} from "../services/nftInventory.js";
import {prisma} from "../db/prisma.js";

export async function registerNftRoutes(app: FastifyInstance) {
    app.get("/api/nft/collection", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        try {
            const cards = await getMergedCollection(user.id);
            return reply.send({ok: true, cards});
        } catch (err) {
            app.log.error({err}, "nft collection failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.post("/api/nft/sync", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
         try {
            const parsed = nftSyncSchema.parse(req.body ?? {});
            let wallet = user.walletAddress;
            if (!wallet && parsed.walletAddress) {
                wallet = parsed.walletAddress;
                try {
                    await prisma.user.update({where: {id: user.id}, data: {walletAddress: wallet}});
                } catch (err) {
                    app.log.warn({err}, "failed to persist walletAddress on sync");
                }
            }
            if (!wallet) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            const cards = await syncWalletInventory(user.id, wallet);
            return reply.send({ok: true, cards});
        } catch (err: any) {
            if (err?.name === "ZodError") {
                return reply.code(400).send({ok: false, error: "VALIDATION_ERROR", issues: err.issues});
            }
            if (err?.message === "WALLET_REQUIRED") {
                return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            }
            app.log.error({err}, "nft sync failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.post("/api/nft/mint", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        if (!user.walletAddress) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
        try {
            const body = nftMintSchema.parse(req.body ?? {});
            const result = await mintNftForUser(user.id, body.cardDefinitionId);
            return reply.send({ok: true, tokenId: result.tokenId, txHash: result.txHash, cards: result.collection});
        } catch (err: any) {
            if (err?.name === "ZodError") {
                return reply.code(400).send({ok: false, error: "VALIDATION_ERROR", issues: err.issues});
            }
            if (err?.message === "WALLET_REQUIRED") {
                return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            }
            if (err?.message === "CARD_NOT_FOUND") {
                return reply.code(404).send({ok: false, error: "CARD_NOT_FOUND"});
            }
            if (err?.message === "CARD_NOT_COLLECTIBLE") {
                return reply.code(400).send({ok: false, error: "CARD_NOT_COLLECTIBLE"});
            }
            if (err?.message === "TOKEN_ID_UNKNOWN") {
                return reply.code(502).send({ok: false, error: "TOKEN_ID_UNKNOWN"});
            }
            app.log.error({err}, "nft mint failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.post("/api/nft/mint-pack", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        if (!user.walletAddress) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
        try {
            const body = nftMintPackSchema.parse(req.body ?? {});
            const result = await mintPackForUser(user.id, body.count ?? 3);
            return reply.send({ok: true, packId: result.packId, txHash: result.txHash, packs: result.packs});
        } catch (err: any) {
            if (err?.name === "ZodError") {
                return reply.code(400).send({ok: false, error: "VALIDATION_ERROR", issues: err.issues});
            }
            if (err?.message === "WALLET_REQUIRED") {
                return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            }
            if (err?.message === "NO_CARDS") {
                return reply.code(400).send({ok: false, error: "NO_CARDS"});
            }
            app.log.error({err}, "nft mint pack failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.get("/api/nft/packs", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        if (!user.walletAddress) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
        try {
            const packs = await listPacksForUser(user.id, user.walletAddress);
            return reply.send({ok: true, packs});
        } catch (err) {
            app.log.error({err}, "packs list failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.post("/api/nft/packs/mint", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        if (!user.walletAddress) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
        try {
            const res = await mintPackForUser(user.id);
            return reply.send({ok: true, packId: res.packId, txHash: res.txHash, packs: res.packs});
        } catch (err: any) {
            if (err?.message === "WALLET_REQUIRED") return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            app.log.error({err}, "pack mint failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    app.post("/api/nft/packs/open", async (req, reply) => {
        const user = await getUserFromRequest(req);
        if (!user) return reply.code(401).send({ok: false, error: "UNAUTHORIZED"});
        if (!user.walletAddress) return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
        const body = req.body as any;
        const packId = body?.packId;
        if (!packId) return reply.code(400).send({ok: false, error: "PACK_ID_REQUIRED"});
        try {
            const res = await openPackForUser(user.id, String(packId));
            return reply.send({ok: true, cardTokenIds: res.cardTokenIds, items: res.items, txHash: res.txHash, packs: res.packs, cards: res.cards});
        } catch (err: any) {
            if (err?.message === "WALLET_REQUIRED") return reply.code(400).send({ok: false, error: "WALLET_REQUIRED"});
            app.log.error({err}, "pack open failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });
}
