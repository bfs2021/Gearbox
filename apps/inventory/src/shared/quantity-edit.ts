// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The editable quantity is kept as text in the input. Native number spinners change that text
 * without necessarily blurring the field, so a change is saved as it happens rather than only
 * on blur. These helpers hold the parsing and the save decision so that behaviour is testable
 * without a browser.
 */

export type ParsedQuantity = { ok: true; value: number } | { ok: false };
export type QuantityPatch =
  | { kind: "save"; quantity: number }
  | { kind: "none" }
  | { kind: "error" };

/** Parse what is typed into the quantity box: a whole number from 0 to a million. */
export function parseQuantity(text: string): ParsedQuantity {
  if (text.trim() === "") return { ok: false };
  // Number() accepts shorthand like "1e3" and trailing junk is rejected by the regex.
  if (!/^\d+$/.test(text.trim())) return { ok: false };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { ok: false };
  return { ok: true, value: n };
}

/** Decide what a change to the quantity text should do relative to the stored quantity. */
export function quantityPatch(parsed: ParsedQuantity, stored: number): QuantityPatch {
  if (!parsed.ok) return { kind: "error" };
  if (parsed.value === stored) return { kind: "none" };
  return { kind: "save", quantity: parsed.value };
}
