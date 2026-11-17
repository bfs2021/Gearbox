// SPDX-License-Identifier: AGPL-3.0-only
import { STATUSES, type Status } from "../db/schema";

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

/** One of the board's columns, or null. */
export const parseStatus = (value: unknown): Status | null =>
  STATUSES.includes(value as Status) ? (value as Status) : null;

/** Now, in Unix seconds. */
export const nowSeconds = () => Math.floor(Date.now() / 1000);
