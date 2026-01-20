/**
 * nft.http.test.ts
 *
 * Lightweight HTTP tests for the NFT endpoints using Fastify inject. Prisma and
 * ethers are mocked so no real DB or chain is required.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import Fastify from "fastify";
import {registerNftRoutes} from "../src/http/nft.js";

const mocks = vi.hoisted(() => {
    return {
        currentUser: {id: "user-1", walletAddress: "0xabc"},
        getUserFromRequest: vi.fn(async () => mocks.currentUser),
        getMergedCollection: vi.fn(async () => mocks.mockCards),
        syncWalletInventory: vi.fn(async () => mocks.mockCards),
        mintNftForUser: vi.fn(async () => ({tokenId: "1", txHash: "0xtx", collection: mocks.mockCards})),
        mintPackForUser: vi.fn(async () => ({items: [], collection: mocks.mockCards})),
        mockCards: [
            {cardId: "c1", dbQuantity: 1, nftQuantity: 2, total: 3, tokens: [{tokenId: "1", level: 1}]},
        ],
    };
});

vi.mock("../src/auth/httpAuth.js", () => ({getUserFromRequest: mocks.getUserFromRequest}));
vi.mock("../src/services/nftInventory.js", () => ({
    getMergedCollection: mocks.getMergedCollection,
    syncWalletInventory: mocks.syncWalletInventory,
    mintNftForUser: mocks.mintNftForUser,
    mintPackForUser: mocks.mintPackForUser,
}));

let app: any;

describe("nft http routes", () => {
    beforeEach(async () => {
        mocks.currentUser = {id: "user-1", walletAddress: "0xabc"};
        mocks.getMergedCollection.mockClear();
        mocks.syncWalletInventory.mockClear();
        mocks.mintNftForUser.mockClear();
        mocks.mintPackForUser.mockClear();
        app = Fastify();
        await registerNftRoutes(app);
    });

    afterEach(async () => {
        try {
            await app.close();
        } catch {
        }
    });

    it("returns collection for authenticated user", async () => {
        const res = await app.inject({method: "GET", url: "/api/nft/collection"});
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.ok).toBe(true);
        expect(body.cards).toEqual(mocks.mockCards);
        expect(mocks.getMergedCollection).toHaveBeenCalledWith("user-1");
    });

    it("rejects unauthenticated requests", async () => {
        mocks.currentUser = null as any;
        const res = await app.inject({method: "GET", url: "/api/nft/collection"});
        expect(res.statusCode).toBe(401);
    });

    it("syncs wallet and returns merged collection", async () => {
        const res = await app.inject({method: "POST", url: "/api/nft/sync"});
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.ok).toBe(true);
        expect(body.cards).toEqual(mocks.mockCards);
        expect(mocks.syncWalletInventory).toHaveBeenCalledWith("user-1", "0xabc");
    });

    it("mints an NFT card", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/nft/mint",
            payload: {cardDefinitionId: "c1"},
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.ok).toBe(true);
        expect(body.tokenId).toBe("1");
        expect(mocks.mintNftForUser).toHaveBeenCalledWith("user-1", "c1");
    });

    it("mints a pack of NFTs", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/nft/mint-pack",
            payload: {count: 2},
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.items)).toBe(true);
        expect(mocks.mintPackForUser?.mock.calls?.length ?? 0).toBeGreaterThan(0);
    });
});
