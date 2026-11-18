// SPDX-License-Identifier: AGPL-3.0-only
import { inTeam, requireMentor } from "@g3/auth";
import { asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createDb } from "../db";
import { boardColumns, cards } from "../db/schema";
import { afterChange } from "../lib/cards";
import {
  MAX_COLUMNS,
  MAX_COLUMN_NAME,
  addColumn,
  inColumn,
  isTeamColumn,
  listColumns,
} from "../lib/columns";
import { parseId } from "../lib/input";
import type { AppEnv } from "../types";

// The board's middle columns, between Not Started and Done (which always stay). Mentors and
// admins add, rename, reorder and delete them; a deleted column's cards go to the bottom of
// Not Started. Pages read them with the cards, from GET /board.

const NAME_ERROR = `Name the column (up to ${MAX_COLUMN_NAME} characters).`;
const FIXED = ["not started", "done"];

const named = validator("json", (value, c): { name: string } => {
  const v = (value && typeof value === "object" ? value : {}) as { name?: unknown };
  const name = typeof v.name === "string" ? v.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > MAX_COLUMN_NAME) return c.json({ error: NAME_ERROR }, 400) as never;
  return { name };
});

const ordered = validator("json", (value, c): { ids: number[] } => {
  const v = (value && typeof value === "object" ? value : {}) as { ids?: unknown };
  const ids = Array.isArray(v.ids) ? v.ids : [];
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    return c.json({ error: "Give every column's id, left to right." }, 400) as never;
  }
  return { ids: ids as number[] };
});

/** Why a name can't be used, or null: it's Not Started's or Done's, or another column has it. */
async function nameTaken(
  db: ReturnType<typeof createDb>,
  teamId: string,
  name: string,
  except?: number,
) {
  const lower = name.toLowerCase();
  if (FIXED.includes(lower)) return `${name} is already a column.`;
  const columns = await listColumns(db, teamId);
  const same = columns.find((col) => col.id !== except && col.name.toLowerCase() === lower);
  return same ? `There's already a column called ${same.name}.` : null;
}

export const columnsRouter = new Hono<AppEnv>()
  .post("/", requireMentor, named, async (c) => {
    const { name } = c.req.valid("json");
    const teamId = c.get("teamId");
    const db = createDb(c.env.PLANNER_DB);
    if ((await listColumns(db, teamId)).length >= MAX_COLUMNS) {
      return c.json({ error: `A board can have up to ${MAX_COLUMNS} columns in the middle.` }, 409);
    }
    const taken = await nameTaken(db, teamId, name);
    if (taken) return c.json({ error: taken }, 409);
    const column = await addColumn(db, teamId, name, c.get("userId"));
    return c.json(column, 201);
  })
  .patch("/:id", requireMentor, named, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Column not found." }, 404);
    const { name } = c.req.valid("json");
    const teamId = c.get("teamId");
    const db = createDb(c.env.PLANNER_DB);
    if (!(await isTeamColumn(db, teamId, id))) return c.json({ error: "Column not found." }, 404);
    const taken = await nameTaken(db, teamId, name, id);
    if (taken) return c.json({ error: taken }, 409);
    await db
      .update(boardColumns)
      .set({ name })
      .where(inTeam(boardColumns, teamId, eq(boardColumns.id, id)));
    return c.json({ id, name });
  })
  // Left to right: every one of the team's middle columns, once.
  .put("/order", requireMentor, ordered, async (c) => {
    const { ids } = c.req.valid("json");
    const teamId = c.get("teamId");
    const db = createDb(c.env.PLANNER_DB);
    const current = (await listColumns(db, teamId)).map((col) => col.id);
    const same =
      ids.length === current.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => current.includes(id));
    if (!same) return c.json({ error: "The columns changed. Reload the board." }, 409);
    if (ids.length) {
      const [first, ...rest] = ids.map((id, sortOrder) =>
        db
          .update(boardColumns)
          .set({ sortOrder })
          .where(inTeam(boardColumns, teamId, eq(boardColumns.id, id))),
      );
      await db.batch([first, ...rest]);
    }
    afterChange(c);
    return c.json({ ok: true });
  })
  // Its cards go to the bottom of Not Started, in their order; then it goes.
  .delete("/:id", requireMentor, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Column not found." }, 404);
    const teamId = c.get("teamId");
    const db = createDb(c.env.PLANNER_DB);
    if (!(await isTeamColumn(db, teamId, id))) return c.json({ error: "Column not found." }, 404);
    const [moving, waiting] = await Promise.all([
      db
        .select({ id: cards.id })
        .from(cards)
        .where(inTeam(cards, teamId, inColumn(id)))
        .orderBy(asc(cards.sortOrder), asc(cards.id))
        .all(),
      db
        .select({ id: cards.id })
        .from(cards)
        .where(inTeam(cards, teamId, inColumn("not_started")))
        .all(),
    ]);
    // The cards first: the database refuses to delete a column a card still points at.
    const steps: BatchItem<"sqlite">[] = [
      ...moving.map((card, i) =>
        db
          .update(cards)
          .set({ status: "not_started", columnId: null, sortOrder: waiting.length + i })
          .where(inTeam(cards, teamId, eq(cards.id, card.id))),
      ),
      db.delete(boardColumns).where(inTeam(boardColumns, teamId, eq(boardColumns.id, id))),
    ];
    await db.batch(steps as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    afterChange(c);
    return c.json({ moved: moving.length });
  });
