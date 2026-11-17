// SPDX-License-Identifier: AGPL-3.0-only
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// All of this is one team's data, and every table carries the team: every query goes through
// inTeam/withTeam from @g3/auth (roadmap Phase 3).

/** One of the team's plans. A placeholder: the app has no features yet. */
export const plans = sqliteTable(
  "plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: text("team_id").notNull(),
    title: text("title").notNull(),
    /** G3ID user id. */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("plans_team_idx").on(t.teamId)],
);

/** Every team table, children first: what deleting or moving a team goes through. */
export const TEAM_TABLES = [plans] as const;
