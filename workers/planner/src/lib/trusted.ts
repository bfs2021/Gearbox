// SPDX-License-Identifier: AGPL-3.0-only
import { hasMentorAccess, inTeam } from "@g3/auth";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { trustedStudents } from "../db/schema";
import type { AppEnv } from "../types";

// Who puts other people on cards: ID's mentors and admins, and the students they trusted in
// Planner (`trusted_students`, chosen on the Admin page). Never a kiosk session.

/** Whether this user may put anyone on a card or take them off. */
export async function canAssign(c: Context<AppEnv>): Promise<boolean> {
  if (c.get("sessionType") === "pin") return false;
  if (hasMentorAccess(c)) return true;
  const row = await createDb(c.env.PLANNER_DB)
    .select({ userId: trustedStudents.userId })
    .from(trustedStudents)
    .where(inTeam(trustedStudents, c.get("teamId"), eq(trustedStudents.userId, c.get("userId"))))
    .get();
  return row !== undefined;
}

/** Mentors, admins and trusted students only (403 otherwise). Goes after requireAuth. */
export const requireAssigner = createMiddleware<AppEnv>(async (c, next) => {
  if (!(await canAssign(c))) {
    return c.json(
      { error: "Only mentors, admins and trusted students can add other people to cards." },
      403,
    );
  }
  await next();
});
