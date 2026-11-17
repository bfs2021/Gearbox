// SPDX-License-Identifier: AGPL-3.0-only
import { env } from "cloudflare:test";
import {
  type Seeded,
  checkIsolation,
  checkTeamDeletion,
  checkTeamExport,
  checkTeamMove,
} from "@g3/testing/isolation";
import type { TeamUsers } from "@g3/testing/users";
import { call } from "@g3/testing/worker";
import { expect, it } from "vitest";
import { app } from "../src/index";

// Two teams, each with a plan. Every route, called as team A's admin, mentor, student and kiosk
// session with team B's ids, must show none of B's and change nothing of B's.

const database = (env as unknown as { PLANNER_DB: D1Database }).PLANNER_DB;
const TABLES = ["plans"];

async function seed(team: TeamUsers): Promise<Seeded> {
  const tag = crypto.randomUUID().slice(0, 8);
  const now = Math.floor(Date.now() / 1000);
  const plan = await database
    .prepare(
      "INSERT INTO plans (team_id, title, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(team.teamId, `Plan ${tag}`, team.mentor.id, now, now)
    .first<{ id: number }>();
  return { params: { id: String(plan?.id) }, markers: [`Plan ${tag}`] };
}

async function snapshot(teamId: string) {
  const rows: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { results } = await database
      .prepare(`SELECT * FROM ${table} WHERE team_id = ? ORDER BY rowid`)
      .bind(teamId)
      .all();
    rows[table] = results;
  }
  return rows;
}

it("keeps every team's plans to itself", async () => {
  const { problems } = await checkIsolation({ app, seed, snapshot });
  expect(problems).toEqual([]);
});

it("deletes a team's data when an operator deletes the team, and only that team's", async () => {
  const problems = await checkTeamDeletion({
    seed,
    snapshot,
    // As the platform calls it, over the service binding (the gateway never answers /internal).
    remove: (teamId) => call(`/internal/teams/${teamId}`, { method: "DELETE" }),
  });
  expect(problems).toEqual([]);
});

it("exports a team's data for its admins, and only that team's", async () => {
  const problems = await checkTeamExport({
    seed,
    // As the platform calls it when an admin downloads the app's data.
    exportOf: (teamId) => call(`/internal/teams/${teamId}/export`),
  });
  expect(problems).toEqual([]);
});

it("moves a team's data to its new id when it changes program, and only that team's", async () => {
  expect(await checkTeamMove({ seed, snapshot })).toEqual([]);
}, 60_000);
