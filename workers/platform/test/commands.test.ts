// SPDX-License-Identifier: AGPL-3.0-only
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/types";

// Slash commands from a team's chat, handed on by G3ID: passed to the app that owns them (here a
// stub that answers with what it got, vitest.config.mts), only while the team has that app on.

const testEnv = env as unknown as AppEnv["Bindings"];

async function newTeam(planner: boolean | null) {
  const number = 20000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 70000);
  const id = `frc${number}`;
  await testEnv.PLATFORM_DB.prepare(
    `INSERT INTO teams (id, team_number, name, country, status, created_at, updated_at)
     VALUES (?1, ?2, 'A Team', 'US', 'active', 1, 1)`,
  )
    .bind(id, number)
    .run();
  if (planner !== null) {
    await testEnv.PLATFORM_DB.prepare(
      "INSERT INTO team_apps (team_id, app, enabled, changed_at) VALUES (?, 'planner', ?, 1)",
    )
      .bind(id, planner ? 1 : 0)
      .run();
  }
  return id;
}

const command = async (teamId: string, name: string, body: unknown) =>
  (await (
    await exports.default.fetch(
      new Request(`http://platform/api/internal/teams/${teamId}/commands/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
  ).json()) as { reply?: string; error?: string };

describe("slash commands", () => {
  it("go to the app that owns them", async () => {
    const team = await newTeam(true);
    expect(await command(team, "gb-add", { userId: "u1", text: "Order bolts" })).toEqual({
      reply: `gb-add for ${team}: u1 said "Order bolts"`,
    });
  });

  it("say so when the team has that app off, or never had it", async () => {
    for (const planner of [false, null]) {
      const team = await newTeam(planner);
      expect(await command(team, "gb-add", { userId: "u1", text: "x" })).toEqual({
        reply: "Planner isn't switched on for your team.",
      });
    }
  });

  it("know only Gearbox's own commands", async () => {
    const team = await newTeam(true);
    expect(await command(team, "gb-nope", { userId: "u1", text: "x" })).toEqual({
      reply: "Gearbox doesn't have that command.",
    });
  });
});
