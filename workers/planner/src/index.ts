// SPDX-License-Identifier: AGPL-3.0-only
import {
  deleteTeamRows,
  exportTeamRows,
  hasMentorAccess,
  moveTarget,
  moveTeamRows,
  requireAuth,
  teamExport,
} from "@g3/auth";
import { isDemoTeam } from "@g3/demo";
import { corsOrigin } from "@g3/site-config";
import { withApiPrefix } from "@g3/site-config/worker";
import { Hono } from "hono";
import { cors } from "hono/cors";
import packageJson from "../package.json";
import { createDb } from "./db";
import { TEAM_TABLES } from "./db/schema";
import { demoWords, loadDemo } from "./demo";
import { manifest } from "./manifest";
import { cardsRouter } from "./routes/cards";
import type { AppEnv } from "./types";

const base = new Hono<AppEnv>();

base.onError((err, c) => {
  console.error("[planner]", err);
  return c.json({ error: "Internal server error." }, 500);
});

base.use(
  "*",
  cors({
    origin: corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "planner", version: packageJson.version }))
  // Only other workers reach /internal: the gateway never answers it.
  // The public demo (roadmap Phase 5): its sample board, after the nightly reset deleted the
  // team's, and the words in it, which the gateway lets demo visitors send.
  .post("/internal/teams/:teamId/demo", async (c) => {
    const teamId = c.req.param("teamId");
    if (!isDemoTeam(teamId)) return c.json({ error: "Only the demo team." }, 403);
    return c.json(await loadDemo(createDb(c.env.PLANNER_DB), teamId));
  })
  .get("/internal/demo/words", (c) => c.json({ words: demoWords() }))
  // The team's data, for its admins to download before switching the app off (the platform's app
  // library).
  .get("/internal/teams/:teamId/export", async (c) => {
    const teamId = c.req.param("teamId");
    const tables = await exportTeamRows(createDb(c.env.PLANNER_DB), teamId, [...TEAM_TABLES]);
    return c.json(teamExport(manifest, teamId, tables));
  })
  // When an operator deletes the team (the platform's console), or 90 days after the team switches
  // the app off (the platform's app library), its data goes too.
  .delete("/internal/teams/:teamId", async (c) => {
    await deleteTeamRows(createDb(c.env.PLANNER_DB), c.req.param("teamId"), [...TEAM_TABLES]);
    return c.json({ ok: true });
  })
  // The team changed program, and so its id (the platform's team moves): its rows go with it.
  .post("/internal/teams/:teamId/move", async (c) => {
    const from = c.req.param("teamId");
    const to = await moveTarget(c.req.raw, from);
    if (!to) return c.json({ error: "Say which team id to move to." }, 400);
    await moveTeamRows(createDb(c.env.PLANNER_DB), from, to, [...TEAM_TABLES]);
    return c.json({ done: true });
  })
  .get("/me", requireAuth, (c) =>
    c.json({
      userId: c.get("userId"),
      displayName: c.get("userDisplayName"),
      /** G3ID mentors and admins. */
      isMentor: hasMentorAccess(c),
      /** G3ID admins. */
      isAdmin: c.get("userIsAdmin"),
      /** Everyone but a kiosk changes the board. */
      canEdit: c.get("sessionType") !== "pin",
    }),
  )
  .route("/cards", cardsRouter);

export type PlannerApp = typeof app;
/** The Hono app itself, for the isolation test (test/isolation.test.ts). */
export { app };
export { STATUSES, type Status } from "./db/schema";

export default { fetch: withApiPrefix(app.fetch) };
