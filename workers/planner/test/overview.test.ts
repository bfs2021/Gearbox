// SPDX-License-Identifier: AGPL-3.0-only
import { env } from "cloudflare:test";
import { newTeamId, teamUsers } from "@g3/testing/users";
import { call, callAs, jsonAs } from "@g3/testing/worker";
import { describe, expect, it } from "vitest";
import { type OverviewCard, overviewText } from "../src/lib/overview";

// Meeting overviews: the text, the channel setting, sending one, keeping it up to date, and
// /gb-add from the team's chat.

const g3id = (env as unknown as { G3ID: Fetcher }).G3ID;
const BOARD = "https://1648-planner.example";

type Card = { id: number; title: string };

/** A team of its own, so its board is only what the test made. */
function team() {
  const users = teamUsers(newTeamId());
  const add = (title: string) =>
    jsonAs<Card>(users.student, "/cards", { method: "POST", body: { title } }, 201);
  const move = (card: Card, status: string) =>
    callAs(users.student, `/cards/${card.id}/move`, { method: "PUT", body: { status, index: 0 } });
  const posts = async () =>
    (await (
      await g3id.fetch(`http://g3id/internal/teams/${users.teamId}/chat/message`)
    ).json()) as { channel: string; text: string }[];
  const edits = async () =>
    (await (await g3id.fetch(`http://g3id/internal/teams/${users.teamId}/chat/edits`)).json()) as {
      message: { channel: string; id: string };
      text: string;
    }[];
  /** The overview's text after the edits in flight (they run after each answer) arrive. */
  async function lastEdit(until: (text: string) => boolean) {
    for (let i = 0; i < 50; i++) {
      const text = (await edits()).at(-1)?.text;
      if (text && until(text)) return text;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return (await edits()).at(-1)?.text ?? "";
  }
  const pickChannel = () =>
    callAs(users.mentor, "/settings", { method: "PUT", body: { overviewChannel: "C0123ABC" } });
  return { ...users, add, move, posts, edits, lastEdit, pickChannel };
}

describe("an overview's text", () => {
  const card = (
    id: number,
    title: string,
    status: OverviewCard["status"],
    names: string[] = [],
  ) => ({
    id,
    title,
    status,
    names,
  });

  it("lists Not Started and In Progress, and crosses off what's done since", () => {
    const text = overviewText(
      [
        card(1, "Order bolts", "not_started"),
        card(2, "Wire it", "in_progress", ["Sam", "Jo"]),
        card(3, "Done before", "done"),
        card(4, "Done since", "done"),
      ],
      new Set([1, 2, 4]),
      BOARD,
    );
    expect(text).toContain("**Not Started**\n• Order bolts");
    expect(text).toContain("**In Progress**\n• Wire it (Sam, Jo)");
    expect(text).toContain("**Done**\n• ~~Done since~~");
    expect(text).not.toContain("Done before");
    expect(text).toContain(`[Open the board](${BOARD})`);
  });

  it("says when a column is empty, and leaves Done out until something is", () => {
    const text = overviewText([], new Set(), BOARD);
    expect(text).toContain("**Not Started**\nNothing here.");
    expect(text).not.toContain("**Done**");
  });

  it("shows titles as written, never as formatting or links", () => {
    const text = overviewText(
      [card(1, "**bold** [x](https://evil) ~~no~~", "not_started")],
      new Set(),
      BOARD,
    );
    expect(text).toContain("• bold (x)(https://evil) no");
  });

  it("fits one Discord message however long the board", () => {
    const many = Array.from({ length: 300 }, (_, i) => card(i, `Task number ${i}`, "not_started"));
    const text = overviewText(many, new Set(), BOARD);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toMatch(/…and \d+ more/);
    expect(text).toContain("Open the board");
  });
});

describe("the overview channel", () => {
  it("is chosen by mentors and admins, not students or kiosks", async () => {
    const t = team();
    expect((await callAs(t.student, "/settings")).status).toBe(403);
    expect((await t.pickChannel()).status).toBe(200);
    expect(await jsonAs(t.admin, "/settings")).toEqual({ overviewChannel: "C0123ABC" });
    const bad = await callAs(t.mentor, "/settings", {
      method: "PUT",
      body: { overviewChannel: "#general" },
    });
    expect(bad.status).toBe(400);
    const cleared = await callAs(t.admin, "/settings", {
      method: "PUT",
      body: { overviewChannel: null },
    });
    expect(await cleared.json()).toEqual({ overviewChannel: null });
  });
});

describe("sending an overview", () => {
  it("needs a channel first, and is for mentors and admins", async () => {
    const t = team();
    const res = await callAs(t.mentor, "/overviews", { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Admin page") });
    expect((await callAs(t.student, "/overviews", { method: "POST" })).status).toBe(403);
  });

  it("posts the board, then keeps it up to date as cards change", async () => {
    const t = team();
    const bolts = await t.add("Order bolts");
    const wire = await t.add("Wire it");
    await t.pickChannel();
    expect(await jsonAs(t.student, "/overviews/latest")).toEqual({ postedAt: null });

    expect((await callAs(t.mentor, "/overviews", { method: "POST" })).status).toBe(200);
    const [posted] = await t.posts();
    expect(posted.channel).toBe("C0123ABC");
    expect(posted.text).toContain("• Order bolts");
    expect(posted.text).toContain("• Wire it");
    expect(await jsonAs(t.student, "/overviews/latest")).toEqual({ postedAt: expect.any(Number) });

    // Finished: crossed off. Started: under In Progress.
    await t.move(bolts, "done");
    expect(await t.lastEdit((text) => text.includes("~~Order bolts~~"))).toContain(
      "**Done**\n• ~~Order bolts~~",
    );
    await t.move(wire, "in_progress");
    expect(await t.lastEdit((text) => text.includes("**In Progress**\n• Wire it"))).toContain(
      "**In Progress**\n• Wire it",
    );

    // Added: listed. Deleted: gone.
    const paint = await t.add("Paint the bumpers");
    expect(await t.lastEdit((text) => text.includes("Paint the bumpers"))).toContain(
      "• Paint the bumpers",
    );
    await callAs(t.admin, `/cards/${paint.id}`, { method: "DELETE" });
    expect(await t.lastEdit((text) => !text.includes("Paint the bumpers"))).not.toContain(
      "Paint the bumpers",
    );
    // Every edit is to the message that was posted.
    expect(new Set((await t.edits()).map((e) => e.message.channel))).toEqual(new Set(["C0123ABC"]));
  });

  it("edits nothing for a team that hasn't sent one", async () => {
    const t = team();
    await t.add("Quiet");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await t.edits()).toEqual([]);
  });
});

describe("/gb-add", () => {
  const command = (teamId: string, body: unknown) =>
    call(`/internal/teams/${teamId}/commands/gb-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("adds a card to Not Started under the member's name, and the overview follows", async () => {
    const t = team();
    await t.pickChannel();
    await callAs(t.mentor, "/overviews", { method: "POST" });

    const res = await command(t.teamId, { userId: t.student.id, text: "  Order more bolts " });
    expect(await res.json()).toEqual({ reply: 'Added "Order more bolts" to Not Started.' });
    const cards = (await jsonAs(t.student, "/cards")) as { title: string; status: string }[];
    expect(cards).toContainEqual(
      expect.objectContaining({ title: "Order more bolts", status: "not_started" }),
    );
    expect(await t.lastEdit((text) => text.includes("Order more bolts"))).toContain(
      "• Order more bolts",
    );
  });

  it("says how to use it when there's nothing after it", async () => {
    const t = team();
    const res = await command(t.teamId, { userId: t.student.id, text: " " });
    expect(((await res.json()) as { reply: string }).reply).toContain("/gb-add Order more bolts");
    expect(await jsonAs(t.student, "/cards")).toEqual([]);
  });
});
