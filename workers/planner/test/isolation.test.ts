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

// Two teams, each with a card with someone on it, an overview channel, an overview listing the
// card and a trusted student. Every route, called as team A's admin, mentor, student and kiosk
// session with team B's ids, must show none of B's and change nothing of B's.

const database = (env as unknown as { PLANNER_DB: D1Database }).PLANNER_DB;
const TABLES = [
  "board_columns",
  "cards",
  "card_members",
  "planner_settings",
  "overviews",
  "overview_cards",
  "trusted_students",
];

async function seed(team: TeamUsers): Promise<Seeded> {
  const tag = crypto.randomUUID().slice(0, 8);
  const now = Math.floor(Date.now() / 1000);
  const column = await database
    .prepare(
      "INSERT INTO board_columns (team_id, name, sort_order, created_by, created_at) VALUES (?, ?, 0, ?, ?) RETURNING id",
    )
    .bind(team.teamId, `Column ${tag}`, team.mentor.id, now)
    .first<{ id: number }>();
  const card = await database
    .prepare(
      "INSERT INTO cards (team_id, title, status, column_id, sort_order, created_by, created_at, updated_at) VALUES (?, ?, 'in_progress', ?, 0, ?, ?, ?) RETURNING id",
    )
    .bind(team.teamId, `Card ${tag}`, column?.id, team.mentor.id, now, now)
    .first<{ id: number }>();
  await database
    .prepare("INSERT INTO card_members (team_id, card_id, user_id, added_at) VALUES (?, ?, ?, ?)")
    .bind(team.teamId, card?.id, team.student.id, now)
    .run();
  await database
    .prepare(
      "INSERT INTO planner_settings (team_id, overview_channel, updated_by, updated_at) VALUES (?, 'C0ISOLATE', ?, ?)",
    )
    .bind(team.teamId, team.mentor.id, now)
    .run();
  const overview = await database
    .prepare(
      "INSERT INTO overviews (team_id, provider, channel, message_id, last_text, posted_by, posted_at) VALUES (?, 'slack', 'C0ISOLATE', '1.1', ?, ?, ?) RETURNING id",
    )
    .bind(team.teamId, `Overview ${tag}`, team.mentor.id, now)
    .first<{ id: number }>();
  await database
    .prepare("INSERT INTO overview_cards (team_id, overview_id, card_id) VALUES (?, ?, ?)")
    .bind(team.teamId, overview?.id, card?.id)
    .run();
  await database
    .prepare(
      "INSERT INTO trusted_students (team_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)",
    )
    .bind(team.teamId, team.student.id, team.mentor.id, now)
    .run();
  return {
    // /cards/:id is the card, /columns/:id the column, :userId the team's student (on the card,
    // and trusted).
    params: (path, name) =>
      name === "userId"
        ? team.student.id
        : String(path.startsWith("/columns") ? column?.id : card?.id),
    markers: [`Card ${tag}`, `Column ${tag}`],
    data: { columnId: column?.id },
  };
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

it("keeps every team's board to itself", async () => {
  const { problems } = await checkIsolation({
    app,
    seed,
    snapshot,
    // Team B's ids in bodies that would pass every check but the team's.
    bodies: (b) => ({
      "POST /cards": { title: "Mine" },
      "PATCH /cards/:id": { title: "Mine" },
      "PUT /cards/:id/move": { column: (b.data as { columnId: number }).columnId, index: 0 },
      "POST /columns": { name: "Mine" },
      "PATCH /columns/:id": { name: "Mine" },
      "PUT /columns/order": { ids: [(b.data as { columnId: number }).columnId] },
      "PUT /settings": { overviewChannel: "C0MINE" },
    }),
  });
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
