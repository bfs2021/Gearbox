// SPDX-License-Identifier: AGPL-3.0-only
import {
  type TeamMessageRef,
  activeMembers,
  editTeamMessage,
  inTeam,
  postTeamMessage,
  withTeam,
} from "@g3/auth";
import { teamAppUrl } from "@g3/site-config";
import { plainChatText } from "@g3/slack";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import {
  type Status,
  cardMembers,
  cards,
  overviewCards,
  overviews,
  plannerSettings,
} from "../db/schema";
import { nowSeconds } from "./input";

// Meeting overviews: a message on the team's chat (Slack or Discord, through G3ID) listing what's
// Not Started and In Progress. Only the team's latest overview is kept up to date: after any change
// to the board, `updateOverview` rewrites it. Every card that has been on it stays: one moved to
// Done shows crossed off, one deleted goes. The text is Gearbox's chat format (@g3/slack's toSlack
// turns it into Slack's), kept under one Discord message, since a message that's edited can't be
// split.

type Env = { G3ID: Fetcher };

/** Room for the text: one Discord message is 2,000 characters. */
const LIMIT = 1900;

export type OverviewCard = { id: number; title: string; status: Status; names: string[] };

const SECTIONS: { status: Status; title: string }[] = [
  { status: "not_started", title: "Not Started" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

/**
 * An overview's text: the cards in Not Started and In Progress, and those of `onOverview` now in
 * Done, crossed off. Cards come in board order. A list too long for one message ends its longest
 * sections with "…and N more".
 */
export function overviewText(
  board: OverviewCard[],
  onOverview: ReadonlySet<number>,
  boardUrl: string,
): string {
  const line = (card: OverviewCard) => {
    const title = plainChatText(card.title) || "Untitled";
    const who = card.names.length ? ` (${card.names.map(plainChatText).join(", ")})` : "";
    return card.status === "done" ? `• ~~${title}~~${who}` : `• ${title}${who}`;
  };
  const lists = SECTIONS.map(({ status, title }) => ({
    status,
    title,
    lines: board
      .filter((card) => card.status === status && (status !== "done" || onOverview.has(card.id)))
      .map(line),
    hidden: 0,
  }));

  const render = () =>
    [
      "**📋 Meeting overview**",
      ...lists
        .filter((list) => list.status !== "done" || list.lines.length + list.hidden > 0)
        .flatMap((list) => [
          "",
          `**${list.title}**`,
          ...(list.lines.length || list.hidden ? list.lines : ["Nothing here."]),
          ...(list.hidden ? [`…and ${list.hidden} more`] : []),
        ]),
      "",
      `[Open the board](${boardUrl}) · Add a card with \`/gb-add\``,
    ].join("\n");

  let text = render();
  while (text.length > LIMIT) {
    const longest = lists.reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
    if (!longest.lines.length) break;
    longest.lines.pop();
    longest.hidden++;
    text = render();
  }
  return text;
}

/** The board as the overview shows it: every card with the names of who's on it. */
async function boardFor(db: Db, env: Env, teamId: string): Promise<OverviewCard[]> {
  const [rows, members, people] = await Promise.all([
    db
      .select({ id: cards.id, title: cards.title, status: cards.status })
      .from(cards)
      .where(inTeam(cards, teamId))
      .orderBy(asc(cards.sortOrder), asc(cards.id))
      .all(),
    db
      .select({ cardId: cardMembers.cardId, userId: cardMembers.userId })
      .from(cardMembers)
      .where(inTeam(cardMembers, teamId))
      .orderBy(asc(cardMembers.addedAt))
      .all(),
    activeMembers(env, teamId).catch(() => null),
  ]);
  const names = new Map((people ?? []).map((m) => [m.id, m.displayName]));
  return rows.map((card) => ({
    ...card,
    names: members
      .filter((m) => m.cardId === card.id && names.has(m.userId))
      .map((m) => names.get(m.userId) as string),
  }));
}

/** Records the cards now in Not Started or In Progress as being on an overview. */
async function remember(db: Db, teamId: string, overviewId: number, board: OverviewCard[]) {
  const open = board.filter((card) => card.status !== "done");
  if (!open.length) return;
  await db
    .insert(overviewCards)
    .values(
      withTeam(
        teamId,
        open.map((card) => ({ overviewId, cardId: card.id })),
      ),
    )
    .onConflictDoNothing();
}

/** The cards that have been on an overview. */
async function cardsOn(db: Db, teamId: string, overviewId: number) {
  const rows = await db
    .select({ cardId: overviewCards.cardId })
    .from(overviewCards)
    .where(inTeam(overviewCards, teamId, eq(overviewCards.overviewId, overviewId)))
    .all();
  return new Set(rows.map((r) => r.cardId));
}

/** The channel the team's overviews go to, or null until an admin picks one. */
export async function overviewChannel(db: Db, teamId: string): Promise<string | null> {
  const row = await db
    .select({ channel: plannerSettings.overviewChannel })
    .from(plannerSettings)
    .where(inTeam(plannerSettings, teamId))
    .get();
  return row?.channel ?? null;
}

/** Posts a new overview to the team's channel; from then on it's the one kept up to date. */
export async function sendOverview(
  db: Db,
  env: Env,
  teamId: string,
  userId: string,
): Promise<{ ok: true; postedAt: number } | { ok: false; error: string }> {
  const channel = await overviewChannel(db, teamId);
  if (!channel)
    return { ok: false, error: "Choose a channel for overviews on Planner's Admin page." };
  const board = await boardFor(db, env, teamId);
  const open = new Set(board.filter((c) => c.status !== "done").map((c) => c.id));
  const text = overviewText(board, open, teamAppUrl(teamId, "planner"));
  const posted = await postTeamMessage(env, teamId, channel, text);
  if (!posted.ok) return { ok: false, error: chatError(posted.error) };

  const postedAt = nowSeconds();
  const [overview] = await db
    .insert(overviews)
    .values(
      withTeam(teamId, {
        provider: posted.message.provider,
        channel: posted.message.channel,
        messageId: posted.message.id,
        lastText: text,
        postedBy: userId,
        postedAt,
      }),
    )
    .returning({ id: overviews.id });
  await remember(db, teamId, overview.id, board);
  return { ok: true, postedAt };
}

/**
 * Rewrites the team's latest overview after a change to the board, if its text changed. Never
 * throws: a failed edit is logged, and the next change tries again.
 */
export async function updateOverview(db: Db, env: Env, teamId: string): Promise<void> {
  try {
    const latest = await db
      .select()
      .from(overviews)
      .where(inTeam(overviews, teamId))
      .orderBy(desc(overviews.id))
      .limit(1)
      .get();
    if (!latest) return;
    const board = await boardFor(db, env, teamId);
    await remember(db, teamId, latest.id, board);
    const text = overviewText(
      board,
      await cardsOn(db, teamId, latest.id),
      teamAppUrl(teamId, "planner"),
    );
    if (text === latest.lastText) return;
    const message: TeamMessageRef = {
      provider: latest.provider,
      channel: latest.channel,
      id: latest.messageId,
    };
    const edited = await editTeamMessage(env, teamId, message, text);
    if (!edited.ok) {
      console.error("[overview] edit failed", teamId, edited.error);
      return;
    }
    await db
      .update(overviews)
      .set({ lastText: text })
      .where(inTeam(overviews, teamId, eq(overviews.id, latest.id)));
  } catch (err) {
    console.error("[overview] update failed", teamId, err);
  }
}

/** What to tell someone whose overview wasn't posted, from the chat service's reason. */
function chatError(error: string): string {
  if (/hasn't connected/.test(error)) {
    return "Your team hasn't connected Slack or Discord. An admin connects it on Integrations, in Portal.";
  }
  if (error === "not_in_channel" || error === "missing_permissions") {
    return "The bot can't post in that channel. Add it to the channel, or choose another on Planner's Admin page.";
  }
  if (error === "channel_not_found") {
    return "That channel is gone. Choose another on Planner's Admin page.";
  }
  return `The overview wasn't posted (${error}).`;
}
