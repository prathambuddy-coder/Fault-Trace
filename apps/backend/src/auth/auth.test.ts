// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { loadAuthConfig } from "./config.ts";
import { ForbiddenError, UnauthorizedError } from "./errors.ts";
import { configureJwt, signToken, verifyToken } from "./jwt.ts";
import { requireAuth } from "./middleware.ts";
import { authRoutes } from "./routes.ts";

describe("JWT signing and verification", () => {
  configureJwt("test-secret-at-least-32-chars-long!", "1h");

  it("signs and verifies valid token", () => {
    const token = signToken({ sub: "engineer1", role: "engineer" });
    const payload = verifyToken(token);
    expect(payload.sub).toBe("engineer1");
    expect(payload.role).toBe("engineer");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("fails on tampered signature", () => {
    const token = signToken({ sub: "engineer1", role: "engineer" });
    const tampered = token.slice(0, -5) + "abcde";
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("fails on expired token", () => {
    configureJwt("test-secret-at-least-32-chars-long!", "1s");
    const token = signToken({ sub: "admin1", role: "admin" });
    // artificially craft an expired payload
    const parts = token.split(".");
    const decoded = JSON.parse(Buffer.from(parts[1] as string, "base64url").toString());
    decoded.exp = Math.floor(Date.now() / 1000) - 100;
    const expiredPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    // re-sign with secret
    const crypto = require("node:crypto");
    const sig = Buffer.from(
      crypto
        .createHmac("sha256", "test-secret-at-least-32-chars-long!")
        .update(`${parts[0]}.${expiredPayload}`)
        .digest(),
    ).toString("base64url");
    const expiredToken = `${parts[0]}.${expiredPayload}.${sig}`;

    expect(() => verifyToken(expiredToken)).toThrow(/expired/);
  });
});

describe("Auth routes and Fastify integration", () => {
  it("allows login for default test user and rejects invalid password", async () => {
    const app = Fastify();
    await app.register(authRoutes());

    // Valid admin login (default password is 'admin')
    const resOk = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "admin", password: "admin" },
    });
    expect(resOk.statusCode).toBe(200);
    const body = resOk.json();
    expect(body.token).toBeDefined();
    expect(body.role).toBe("admin");

    // Invalid password
    const resBad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "admin", password: "wrongpassword" },
    });
    expect(resBad.statusCode).toBe(401);

    // /auth/me with the valid token
    const resMe = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${body.token}`,
      },
    });
    expect(resMe.statusCode).toBe(200);
    expect(resMe.json()).toEqual({ username: "admin", role: "admin" });

    // /auth/me without token
    const resNoAuth = await app.inject({
      method: "GET",
      url: "/auth/me",
    });
    expect(resNoAuth.statusCode).toBe(401);

    await app.close();
  });
});
