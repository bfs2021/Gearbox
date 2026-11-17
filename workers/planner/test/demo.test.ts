// SPDX-License-Identifier: AGPL-3.0-only
import { demoTeamId } from "@g3/site-config";
import { checkDemoHook } from "@g3/testing/demo";
import { call } from "@g3/testing/worker";
import { describe, it } from "vitest";

// The public demo's Planner (roadmap 5.3): a board with a few cards in each column.

describe("the demo's sample data", () => {
  it("loads, reloads after a reset, and is only for the demo team", async () => {
    await checkDemoHook(async () => {
      const res = await call(`/internal/teams/${demoTeamId}/export`);
      const { tables } = (await res.json()) as { tables: { cards?: unknown[] } };
      return tables.cards?.length ?? 0;
    });
  });
});
