// SPDX-License-Identifier: AGPL-3.0-only
import { inTeam, logTeamChange, requireAuth, requireMentor, withTeam } from "@g3/auth";
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createDb } from "../db";
import { overviews, plannerSettings } from "../db/schema";
import { nowSeconds } from "../lib/input";
import { overviewChannel, parseTimeZone, sendOverview } from "../lib/overview";
import type { AppEnv } from "../types";

// Meeting overviews (src/lib/overview.ts): mentors and admins choose the channel and send one;
// everyone sees when the last one went.

const channelBody = validator("json", (value, c): { overviewChannel: string | null } => {
  const v = (value && typeof value === "object" ? value : {}) as { overviewChannel?: unknown };
  const channel = v.overviewChannel;
  if (channel === null || channel === "") return { overviewChannel: null };
  // A Slack (C…/G…) or Discord (digits) channel id; G3ID checks it against the team's chat.
  if (typeof channel !== "string" || !/^([CG][A-Z0-9]{2,30}|\d{15,25})$/.test(channel)) {
    return c.json({ error: "Choose a channel." }, 400) as never;
  }
  return { overviewChannel: channel };
});

export const settingsRouter = new Hono<AppEnv>()
  .get("/", requireMentor, async (c) =>
    c.json({
      overviewChannel: await overviewChannel(createDb(c.env.PLANNER_DB), c.get("teamId")),
    }),
  )
  .put("/", requireMentor, channelBody, async (c) => {
    const { overviewChannel: channel } = c.req.valid("json");
    const teamId = c.get("teamId");
    const now = nowSeconds();
    const values = { overviewChannel: channel, updatedBy: c.get("userId"), updatedAt: now };
    const db = createDb(c.env.PLANNER_DB);
    const before = await overviewChannel(db, teamId);
    await db
      .insert(plannerSettings)
      .values(withTeam(teamId, values))
      .onConflictDoUpdate({ target: plannerSettings.teamId, set: values });
    if (before !== channel) {
      await logTeamChange(c.env, teamId, {
        userId: c.get("userId"),
        app: "planner",
        what: "Planner settings",
        changed: ["Channel for meeting overviews"],
      });
    }
    return c.json({ overviewChannel: channel });
  });

/** A send's body: the sender's time zone, if their browser said (anything else is ignored). */
const sendBody = validator("json", (value): { timeZone?: string } => {
  const timeZone = (value as { timeZone?: unknown } | null)?.timeZone;
  return typeof timeZone === "string" ? { timeZone } : {};
});

export const overviewsRouter = new Hono<AppEnv>()
  // When the team's last overview went, if it ever sent one.
  .get("/latest", requireAuth, async (c) => {
    const latest = await createDb(c.env.PLANNER_DB)
      .select({ postedAt: overviews.postedAt })
      .from(overviews)
      .where(inTeam(overviews, c.get("teamId")))
      .orderBy(desc(overviews.id))
      .limit(1)
      .get();
    return c.json({ postedAt: latest?.postedAt ?? null });
  })
  // `{ timeZone }`: the sender's, from their browser, for the date in the heading (UTC without).
  .post("/", requireMentor, sendBody, async (c) => {
    const body = c.req.valid("json");
    const sent = await sendOverview(
      createDb(c.env.PLANNER_DB),
      c.env,
      c.get("teamId"),
      c.get("userId"),
      parseTimeZone(body.timeZone) ?? "UTC",
    );
    if (!sent.ok) return c.json({ error: sent.error }, 409);
    return c.json({ postedAt: sent.postedAt });
  });
