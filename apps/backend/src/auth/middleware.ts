// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * Fastify preHandler hook for JWT authentication and role-based access control.
 *
 * Usage:
 *   fastify.addHook('preHandler', requireAuth())          // any authenticated role
 *   fastify.addHook('preHandler', requireAuth(['admin']))  // admin only
 *
 * Or on a single route:
 *   fastify.post('/route', { preHandler: requireAuth(['admin', 'engineer']) }, handler)
 *
 * Errors:
 *   - 401 Unauthorized — missing or invalid/expired Bearer token
 *   - 403 Forbidden    — valid token but role not in the allowed list
 */

import type { preHandlerHookHandler } from "fastify";

import { ForbiddenError, UnauthorizedError } from "./errors.ts";
import { verifyToken, type JwtPayload } from "./jwt.ts";

// ---------------------------------------------------------------------------
// Module augmentation so `request.jwtPayload` is typed everywhere
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by {@link requireAuth} after successful token verification. */
    jwtPayload?: JwtPayload;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a Fastify `preHandlerHookHandler` that:
 *  1. Reads `Authorization: Bearer <token>` from the request headers.
 *  2. Verifies the token with {@link verifyToken}; throws 401 on failure.
 *  3. When `roles` is provided, checks that the token's role is in the list;
 *     throws 403 if not.
 *  4. Attaches the decoded payload to `request.jwtPayload`.
 *
 * Pass no argument (or an empty array) to allow any authenticated user.
 */
export function requireAuth(roles?: ReadonlyArray<JwtPayload["role"]>): preHandlerHookHandler {
  return async function authPreHandler(request, _reply) {
    const authHeader = request.headers["authorization"];
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or malformed Authorization header");
    }

    const token = authHeader.slice(7); // strip "Bearer "
    let payload: JwtPayload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid token";
      throw new UnauthorizedError(message);
    }

    if (roles !== undefined && roles.length > 0 && !roles.includes(payload.role)) {
      throw new ForbiddenError(
        `Role "${payload.role}" is not permitted; required: ${roles.join(", ")}`,
      );
    }

    request.jwtPayload = payload;
  };
}
