// SPDX-License-Identifier: AGPL-3.0-only
import { activeMembers, inTeam, requireMentor, withTeam } from "@g3/auth";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { trustedStudents } from "../db/schema";
import { nowSeconds } from "../lib/input";
import type { AppEnv } from "../types";

// Trusted students (mentors and admins choose them, on Planner's Admin page): they put anyone on
// a card or take them off, like mentors. Planner keeps no list of people: names and roles come
// from G3ID.

const membersUnavailable = { error: "Couldn't load the team's members. Try again." } as const;

export const trustedRouter = new Hono<AppEnv>()
  .use("*", requireMentor)
  // The trusted students, and the members who could be (students not trusted yet).
  .get("/", async (c) => {
    const team = c.get("teamId");
    const [rows, members] = await Promise.all([
      createDb(c.env.PLANNER_DB)
        .select()
        .from(trustedStudents)
        .where(inTeam(trustedStudents, team))
        .orderBy(asc(trustedStudents.addedAt))
        .all(),
      activeMembers(c.env, team),
    ]);
    if (!members) return c.json(membersUnavailable, 503);
    const names = new Map(members.map((m) => [m.id, m.displayName]));
    const trusted = new Set(rows.map((r) => r.userId));
    return c.json({
      trusted: rows.map((row) => ({
        userId: row.userId,
        /** Null for someone who has since left the team: they can't do anything anyway. */
        displayName: names.get(row.userId) ?? null,
      })),
      students: members
        .filter((m) => !m.isMentor && !m.isAdmin && !trusted.has(m.id))
        .map(({ id, displayName }) => ({ id, displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    });
  })
  .put("/:userId", async (c) => {
    const team = c.get("teamId");
    const userId = c.req.param("userId");
    const members = await activeMembers(c.env, team);
    if (!members) return c.json(membersUnavailable, 503);
    if (!members.some((m) => m.id === userId)) {
      return c.json({ error: "Only the team's active members can be trusted." }, 400);
    }
    await createDb(c.env.PLANNER_DB)
      .insert(trustedStudents)
      .values(withTeam(team, { userId, addedBy: c.get("userId"), addedAt: nowSeconds() }))
      .onConflictDoNothing();
    return c.json({ ok: true });
  })
  .delete("/:userId", async (c) => {
    await createDb(c.env.PLANNER_DB)
      .delete(trustedStudents)
      .where(
        inTeam(trustedStudents, c.get("teamId"), eq(trustedStudents.userId, c.req.param("userId"))),
      );
    return c.json({ ok: true });
  });
