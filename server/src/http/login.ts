/**
 * login.ts
 *
 * Routes for user authentication. Exposes `/api/login` and maps known
 * service errors to HTTP responses.
 */

import type {FastifyInstance} from "fastify";
import {loginUser} from "../auth/service.js";
import {issueSiweChallenge, verifySiweSignature} from "../auth/siwe.js";
import {siweChallengeSchema, siweVerifySchema} from "../schemas/siwe.js";

export async function registerLoginRoutes(app: FastifyInstance) {
    app.post("/api/login", async (req, reply) => {
        try {
            const result = await loginUser(req.body);
            app.log.info({userId: result.user.id}, "user logged in");
            return reply
                .code(200)
                .send({ok: true, user: result.user, token: result.token});
        } catch (err: any) {
            if (err?.message === "INVALID_CREDENTIALS") {
                app.log.error({err: err.message}, "login failed");
                return reply.code(401).send({
                    ok: false,
                    error: "INVALID_CREDENTIALS",
                    msg: "Invalid username/email or password.",
                });
            }
            if (err?.name === "ZodError") {
                app.log.error({err}, "login validation error");
                return reply.code(400).send({
                    ok: false,
                    error: "VALIDATION_ERROR",
                    issues: err.issues,
                });
            }
            app.log.error({err}, "login failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    // Web3 SIWE-style challenge endpoint
    app.post("/api/login/siwe/challenge", async (req, reply) => {
        try {
            const domain = req.headers.host ?? "localhost";
            const body = siweChallengeSchema.parse(req.body);
            const challenge = await issueSiweChallenge(body, domain);
            return reply.code(200).send({ok: true, ...challenge});
        } catch (err: any) {
            if (err?.name === "ZodError") {
                return reply.code(400).send({ok: false, error: "VALIDATION_ERROR", issues: err.issues});
            }
            app.log.error({err}, "siwe challenge failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });

    // Web3 SIWE-style verify endpoint
    app.post("/api/login/siwe/verify", async (req, reply) => {
        try {
            const domain = req.headers.host ?? "localhost";
            const body = siweVerifySchema.parse(req.body);
            const result = await verifySiweSignature(body, domain);
            return reply.code(200).send({ok: true, user: result.user, token: result.token});
        } catch (err: any) {
            if (err?.name === "ZodError") {
                return reply.code(400).send({ok: false, error: "VALIDATION_ERROR", issues: err.issues});
            }
            if (err?.message === "INVALID_NONCE") {
                return reply.code(401).send({ok: false, error: "INVALID_NONCE"});
            }
            if (err?.message === "NONCE_EXPIRED") {
                return reply.code(401).send({ok: false, error: "NONCE_EXPIRED"});
            }
            if (err?.message === "INVALID_SIGNATURE") {
                return reply.code(401).send({ok: false, error: "INVALID_SIGNATURE"});
            }
            app.log.error({err}, "siwe verify failed");
            return reply.code(500).send({ok: false, error: "INTERNAL_ERROR"});
        }
    });
}
