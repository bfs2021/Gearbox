// SPDX-License-Identifier: AGPL-3.0-only
/** The longest card title. */
export const MAX_TITLE = 200;

/** A positive integer id from a path segment, or null. */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A card's title, trimmed, or null if it's missing, empty or too long. */
export function parseTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TITLE ? trimmed : null;
}

/** Now, in Unix seconds. */
export const nowSeconds = () => Math.floor(Date.now() / 1000);
