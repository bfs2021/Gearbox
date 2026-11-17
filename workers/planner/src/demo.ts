// SPDX-License-Identifier: AGPL-3.0-only
import { withTeam } from "@g3/auth";
import { DEMO_PEOPLE, type DemoPerson, vocabularyOf } from "@g3/demo";
import type { Db } from "./db";
import { plans } from "./db/schema";

// The public demo's Planner (roadmap 5.3), loaded after its nightly reset: a couple of plans.

const PLANS = ["Build season", "Off-season projects"];

export async function loadDemo(db: Db, teamId: string) {
  const seconds = Math.floor(Date.now() / 1000);
  const mentor = DEMO_PEOPLE[1] as DemoPerson;
  await db
    .insert(plans)
    .values(
      PLANS.map((title) =>
        withTeam(teamId, { title, createdBy: mentor.id, createdAt: seconds, updatedAt: seconds }),
      ),
    );
  return { plans: PLANS.length };
}

/** The words in the sample data, which demo visitors may send back. */
export const demoWords = (): string[] => vocabularyOf(PLANS);
