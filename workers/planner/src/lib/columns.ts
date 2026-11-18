// SPDX-License-Identifier: AGPL-3.0-only
import { inTeam, withTeam } from "@g3/auth";
import { type SQL, and, asc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "../db";
import { type Status, boardColumns, cards } from "../db/schema";
import { nowSeconds } from "./input";

// The board's columns: Not Started and Done always, and between them the team's own (as many as
// it wants, named as it likes; `board_columns`). Pages and the API name a column by "not_started",
// "done" or a middle column's id; in the database a card in a middle column has status
// "in_progress" and that `column_id`.

/** A column of the board: one of the two that always stay, or a middle column's id. */
export type Column = "not_started" | "done" | number;

export { MAX_COLUMN_NAME, MAX_COLUMNS } from "../limits";
/** The middle column a team starts with (it can rename or delete it). */
export const FIRST_COLUMN = "In Progress";

/** A card's column, from its status and `column_id`. */
export const columnOf = (card: { status: Status; columnId: number | null }): Column =>
  card.status === "in_progress" && card.columnId !== null
    ? card.columnId
    : card.status === "done"
      ? "done"
      : "not_started";

/** A column from a request: "not_started", "done" or a positive id; null for anything else. */
export function parseColumn(value: unknown): Column | null {
  if (value === "not_started" || value === "done") return value;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** The status and `column_id` a card in that column has. */
export const placeOf = (column: Column): { status: Status; columnId: number | null } =>
  typeof column === "number"
    ? { status: "in_progress", columnId: column }
    : { status: column, columnId: null };

/** The cards in a column, as a condition. */
export function inColumn(column: Column): SQL {
  const { status, columnId } = placeOf(column);
  return and(
    eq(cards.status, status),
    columnId === null ? isNull(cards.columnId) : eq(cards.columnId, columnId),
  ) as SQL;
}

/** The team's middle columns, left to right. */
export function listColumns(db: Db, teamId: string) {
  return db
    .select({ id: boardColumns.id, name: boardColumns.name })
    .from(boardColumns)
    .where(inTeam(boardColumns, teamId))
    .orderBy(asc(boardColumns.sortOrder), asc(boardColumns.id))
    .all();
}

/** Whether a middle column is the team's. */
export async function isTeamColumn(db: Db, teamId: string, id: number): Promise<boolean> {
  const row = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(inTeam(boardColumns, teamId, eq(boardColumns.id, id)))
    .get();
  return !!row;
}

/** A new middle column, at the right end (just before Done). */
export async function addColumn(db: Db, teamId: string, name: string, userId: string | null) {
  const last = await db
    .select({ sortOrder: max(boardColumns.sortOrder) })
    .from(boardColumns)
    .where(inTeam(boardColumns, teamId))
    .get();
  const [column] = await db
    .insert(boardColumns)
    .values(
      withTeam(teamId, {
        name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdBy: userId,
        createdAt: nowSeconds(),
      }),
    )
    .returning({ id: boardColumns.id, name: boardColumns.name });
  return column;
}

/**
 * A team switching Planner on starts with one middle column, In Progress, unless it already has
 * some. Safe to run again (the platform's seed hook).
 */
export async function seedColumns(db: Db, teamId: string): Promise<void> {
  if ((await listColumns(db, teamId)).length) return;
  await addColumn(db, teamId, FIRST_COLUMN, null);
}
