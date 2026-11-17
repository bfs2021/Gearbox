// SPDX-License-Identifier: AGPL-3.0-only
import {
  activeMembers,
  inTeam,
  requireAdmin,
  requireAuth,
  requireOAuthSession,
  withTeam,
} from "@g3/auth";
import { asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createDb } from "../db";
import { type Status, cardMembers, cards } from "../db/schema";
import { CARD_COLUMNS, addCard, afterChange } from "../lib/cards";
import { nowSeconds, parseId, parseStatus, parseTitle } from "../lib/input";
import type { AppEnv } from "../types";

// The team's board. Everyone signed in reads it; everyone but a kiosk adds, renames and moves
// cards, and puts themselves on a card or takes themselves off. Only admins delete cards. Pages poll GET /cards, so everyone's board follows the others'.

const TITLE_ERROR = "Give the card a title (up to 200 characters).";

/** A body's fields, whatever was sent. */
const fieldsOf = (value: unknown) =>
  (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

const newCard = validator("json", (value, c): { title: string } => {
  const title = parseTitle(fieldsOf(value).title);
  if (!title) return c.json({ error: TITLE_ERROR }, 400) as never;
  return { title };
});

const rename = validator("json", (value, c): { title: string } => {
  const title = parseTitle(fieldsOf(value).title);
  if (!title) return c.json({ error: TITLE_ERROR }, 400) as never;
  return { title };
});

const place = validator("json", (value, c): { status: Status; index: number } => {
  const v = fieldsOf(value);
  const status = parseStatus(v.status);
  const index = v.index;
  if (!status || typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return c.json({ error: "Say which column and where in it." }, 400) as never;
  }
  return { status, index };
});

export const cardsRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const db = createDb(c.env.PLANNER_DB);
    const teamId = c.get("teamId");
    const [rows, members] = await Promise.all([
      db
        .select(CARD_COLUMNS)
        .from(cards)
        .where(inTeam(cards, teamId))
        .orderBy(asc(cards.status), asc(cards.sortOrder), asc(cards.id))
        .all(),
      db
        .select({ cardId: cardMembers.cardId, userId: cardMembers.userId })
        .from(cardMembers)
        .where(inTeam(cardMembers, teamId))
        .orderBy(asc(cardMembers.addedAt))
        .all(),
    ]);
    const on = new Map<number, string[]>();
    for (const m of members) on.set(m.cardId, [...(on.get(m.cardId) ?? []), m.userId]);
    return c.json(rows.map((card) => ({ ...card, memberIds: on.get(card.id) ?? [] })));
  })
  // The team's names, for who's on each card.
  .get("/people", requireAuth, async (c) => {
    const members = await activeMembers(c.env, c.get("teamId"));
    if (!members) return c.json({ error: "Can't reach the team's member list. Try again." }, 503);
    return c.json(members.map(({ id, displayName }) => ({ id, displayName })));
  })
  // A new card, at the bottom of Not Started: every card starts there.
  .post("/", requireAuth, requireOAuthSession, newCard, async (c) => {
    const { title } = c.req.valid("json");
    const teamId = c.get("teamId");
    const card = await addCard(createDb(c.env.PLANNER_DB), teamId, title, c.get("userId"));
    afterChange(c);
    return c.json(card, 201);
  })
  .patch("/:id", requireAuth, requireOAuthSession, rename, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Card not found." }, 404);
    const { title } = c.req.valid("json");
    const db = createDb(c.env.PLANNER_DB);
    const [card] = await db
      .update(cards)
      .set({ title, updatedAt: nowSeconds() })
      .where(inTeam(cards, c.get("teamId"), eq(cards.id, id)))
      .returning(CARD_COLUMNS);
    if (!card) return c.json({ error: "Card not found." }, 404);
    afterChange(c);
    return c.json(card);
  })
  // Puts a card in a column at `index` (0 is the top), renumbering that column.
  .put("/:id/move", requireAuth, requireOAuthSession, place, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Card not found." }, 404);
    const { status, index } = c.req.valid("json");
    const db = createDb(c.env.PLANNER_DB);
    const teamId = c.get("teamId");
    const card = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inTeam(cards, teamId, eq(cards.id, id)))
      .get();
    if (!card) return c.json({ error: "Card not found." }, 404);

    const others = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inTeam(cards, teamId, eq(cards.status, status), ne(cards.id, id)))
      .orderBy(asc(cards.sortOrder), asc(cards.id))
      .all();
    const order = others.map((r) => r.id);
    order.splice(Math.min(index, order.length), 0, id);

    const now = nowSeconds();
    const [first, ...rest] = order.map((cardId, sortOrder) =>
      db
        .update(cards)
        .set(cardId === id ? { status, sortOrder, updatedAt: now } : { sortOrder })
        .where(inTeam(cards, teamId, eq(cards.id, cardId))),
    );
    await db.batch([first, ...rest]);
    afterChange(c);
    return c.json({ ok: true });
  })
  // Puts yourself on a card, or takes yourself off: only ever yourself.
  .put("/:id/members/me", requireAuth, requireOAuthSession, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Card not found." }, 404);
    const db = createDb(c.env.PLANNER_DB);
    const teamId = c.get("teamId");
    const card = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inTeam(cards, teamId, eq(cards.id, id)))
      .get();
    if (!card) return c.json({ error: "Card not found." }, 404);
    await db
      .insert(cardMembers)
      .values(withTeam(teamId, { cardId: id, userId: c.get("userId"), addedAt: nowSeconds() }))
      .onConflictDoNothing();
    afterChange(c);
    return c.json({ ok: true });
  })
  .delete("/:id/members/me", requireAuth, requireOAuthSession, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Card not found." }, 404);
    await createDb(c.env.PLANNER_DB)
      .delete(cardMembers)
      .where(
        inTeam(
          cardMembers,
          c.get("teamId"),
          eq(cardMembers.cardId, id),
          eq(cardMembers.userId, c.get("userId")),
        ),
      );
    afterChange(c);
    return c.json({ ok: true });
  })
  // Only the team's admins delete cards.
  .delete("/:id", requireAdmin, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Card not found." }, 404);
    const db = createDb(c.env.PLANNER_DB);
    const [gone] = await db
      .delete(cards)
      .where(inTeam(cards, c.get("teamId"), eq(cards.id, id)))
      .returning({ id: cards.id });
    if (!gone) return c.json({ error: "Card not found." }, 404);
    afterChange(c);
    return c.json({ ok: true });
  });
