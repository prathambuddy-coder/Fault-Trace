// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * REST routes for authentication: login and identity check.
 *
 * - `POST /api/auth/login`: authenticate with username and password, returns JWT token
 * - `GET /api/auth/me`: return current user identity and role (requires Bearer token)
 */

import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";

import { loadAuthConfig, type AuthConfig } from "./config.ts";
import { UnauthorizedError } from "./errors.ts";
import { configureJwt, signToken } from "./jwt.ts";
import { requireAuth } from "./middleware.ts";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

/** Compute lowercase hex SHA-256 digest of a string. */
function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Verify password against stored hex hash in constant time. */
function verifyPassword(password: string, expectedHash: string): boolean {
  const actualHash = sha256hex(password);
  const bufExpected = Buffer.from(expectedHash, "hex");
  const bufActual = Buffer.from(actualHash, "hex");
  if (bufExpected.length !== bufActual.length) return false;
  return timingSafeEqual(bufExpected, bufActual);
}

export function authRoutes(config?: AuthConfig): FastifyPluginAsync {
  const authConfig = config ?? loadAuthConfig();
  // Ensure JWT signing is configured with the secret from config
  configureJwt(authConfig.jwtSecret, authConfig.jwtExpiresIn);

  return async (fastify) => {
    fastify.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
      const { username, password } = request.body ?? {};
      if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
        throw new UnauthorizedError("Username and password are required");
      }

      const user = authConfig.users.get(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new UnauthorizedError("Invalid username or password");
      }

      const token = signToken({
        sub: username,
        role: user.role,
      });

      return reply.code(200).send({
        token,
        role: user.role,
        expiresIn: authConfig.jwtExpiresIn,
      });
    });

    fastify.get("/auth/me", { preHandler: requireAuth() }, async (request, reply) => {
      const payload = request.jwtPayload;
      if (!payload) {
        throw new UnauthorizedError("Not authenticated");
      }
      return reply.code(200).send({
        username: payload.sub,
        role: payload.role,
      });
    });
  };
}
