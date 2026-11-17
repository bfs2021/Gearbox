// SPDX-License-Identifier: AGPL-3.0-only
import { inTeam, withTeam } from "@g3/auth";
import { eq, max } from "drizzle-orm";
import type { Context } from "hono";
import { type Db, createDb } from "../db";
import { type Status, cards } from "../db/schema";
import type { AppEnv } from "../types";
import { nowSeconds } from "./input";
import { updateOverview } from "./overview";

/** What a page gets for a card. */
export const CARD_COLUMNS = {
  id: cards.id,
  title: cards.title,
  status: cards.status,
  sortOrder: cards.sortOrder,
} as const;

/** A new card at the bottom of Not Started, where every card starts (the page, or /gb-add). */
export async function addCard(db: Db, teamId: string, title: string, userId: string) {
  const status: Status = "not_started";
  const last = await db
    .select({ sortOrder: max(cards.sortOrder) })
    .from(cards)
    .where(inTeam(cards, teamId, eq(cards.status, status)))
    .get();
  const now = nowSeconds();
  const [card] = await db
    .insert(cards)
    .values(
      withTeam(teamId, {
        title,
        status,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    )
    .returning(CARD_COLUMNS);
  return card;
}

/** After a change to the board: the team's meeting overview follows, after the answer goes. */
export function afterChange(c: Context<AppEnv>, teamId = c.get("teamId")) {
  c.executionCtx.waitUntil(updateOverview(createDb(c.env.PLANNER_DB), c.env, teamId));
}
