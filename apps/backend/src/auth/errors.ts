// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * Authentication and authorization errors.
 */

/** HTTP 401 — Missing or invalid authentication token. */
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";

  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** HTTP 403 — Authenticated user does not have permission for this resource. */
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";

  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
