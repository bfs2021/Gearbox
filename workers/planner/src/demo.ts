// SPDX-License-Identifier: AGPL-3.0-only
import { withTeam } from "@g3/auth";
import { DEMO_PEOPLE, type DemoPerson, vocabularyOf } from "@g3/demo";
import type { Db } from "./db";
import { type Status, cardMembers, cards } from "./db/schema";

// The public demo's Planner (roadmap 5.3), loaded after its nightly reset: a board with a few
// cards in each column, and people on the ones under way.

const BOARD: Record<Status, string[]> = {
  not_started: ["Order spare bearings", "Practice autos", "Write the build log"],
  in_progress: ["Wire the drivetrain", "Update the CAD"],
  done: ["Pick up the field elements", "Inventory the pit cart"],
};

export async function loadDemo(db: Db, teamId: string) {
  const seconds = Math.floor(Date.now() / 1000);
  const mentor = DEMO_PEOPLE[1] as DemoPerson;
  const rows = Object.entries(BOARD).flatMap(([status, titles]) =>
    titles.map((title, sortOrder) => ({
      title,
      status: status as Status,
      sortOrder,
      createdBy: mentor.id,
      createdAt: seconds,
      updatedAt: seconds,
    })),
  );
  const made = await db
    .insert(cards)
    .values(withTeam(teamId, rows))
    .returning({ id: cards.id, status: cards.status });
  // Two people on each card in progress, one on each done.
  const people = made.flatMap((card, i) =>
    card.status === "not_started"
      ? []
      : DEMO_PEOPLE.slice(i % 3, (i % 3) + (card.status === "in_progress" ? 2 : 1)).map((p) => ({
          cardId: card.id,
          userId: p.id,
          addedAt: seconds,
        })),
  );
  if (people.length) await db.insert(cardMembers).values(withTeam(teamId, people));
  return { cards: rows.length };
}

/** The words in the sample data, which demo visitors may send back. */
export const demoWords = (): string[] => vocabularyOf(BOARD);
