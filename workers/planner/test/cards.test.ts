// SPDX-License-Identifier: AGPL-3.0-only
import { admin, kioskAdmin, mentor, otherStudent, student } from "@g3/testing/users";
import { callAs, jsonAs } from "@g3/testing/worker";
import { describe, expect, it } from "vitest";

type Column = "not_started" | "done" | number;
type Card = { id: number; title: string; column: Column; sortOrder: number; memberIds: string[] };

const add = (title: string, column?: Column) =>
  jsonAs<Card>(student, "/cards", { method: "POST", body: { title, column } }, 201);

const move = (card: Card, column: unknown, index: number) =>
  callAs(student, `/cards/${card.id}/move`, { method: "PUT", body: { column, index } });

/** A middle column of the board, made by a mentor. */
const middle = async (name: string) =>
  (await jsonAs<{ id: number }>(mentor, "/columns", { method: "POST", body: { name } }, 201)).id;

/** The titles in a column, top first, of the cards made in this test (by tag). */
async function column(at: Column, tag: string) {
  const cards = (await jsonAs(student, "/cards")) as Card[];
  return cards
    .filter((c) => c.column === at && c.title.includes(tag))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.title.replace(` ${tag}`, ""));
}

describe("the board", () => {
  it("adds cards to the bottom of Not Started, whatever column is asked for", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    expect((await add(`A ${tag}`)).column).toBe("not_started");
    await add(`B ${tag}`);
    expect((await add(`C ${tag}`, "done")).column).toBe("not_started");
    expect(await column("not_started", tag)).toEqual(["A", "B", "C"]);
    expect(await column("done", tag)).toEqual([]);
  });

  it("moves a card to another column, or within one, at the place it's dropped", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const doing = await middle(`Doing ${tag}`);
    const a = await add(`A ${tag}`);
    await add(`B ${tag}`);
    const c = await add(`C ${tag}`);
    expect((await move(c, "not_started", 0)).status).toBe(200);
    expect(await column("not_started", tag)).toEqual(["C", "A", "B"]);

    // Another member sees the same board.
    expect((await move(a, doing, 0)).status).toBe(200);
    const theirs = (await jsonAs(otherStudent, "/cards")) as Card[];
    expect(theirs.find((card) => card.id === a.id)?.column).toBe(doing);
    expect(await column("not_started", tag)).toEqual(["C", "B"]);

    // Past the end goes to the bottom.
    expect((await move(c, doing, 99)).status).toBe(200);
    expect(await column(doing, tag)).toEqual(["A", "C"]);
    expect((await move(c, "done", 0)).status).toBe(200);
    expect(await column("done", tag)).toEqual(["C"]);

    expect((await move(c, "nowhere", 0)).status).toBe(400);
    expect((await move(c, "done", -1)).status).toBe(400);
    // A column that isn't there (or isn't the team's).
    expect((await move(c, 999999, 0)).status).toBe(404);
  });

  it("renames cards, and lets only admins delete them", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const card = await add(`Old ${tag}`);
    const renamed = await jsonAs(student, `/cards/${card.id}`, {
      method: "PATCH",
      body: { title: `  New ${tag}  ` },
    });
    expect(renamed).toMatchObject({ title: `New ${tag}` });
    expect(
      (await callAs(student, `/cards/${card.id}`, { method: "PATCH", body: { title: " " } }))
        .status,
    ).toBe(400);
    const remove = (user: typeof student) =>
      callAs(user, `/cards/${card.id}`, { method: "DELETE" });
    expect((await remove(student)).status).toBe(403);
    expect((await remove(mentor)).status).toBe(403);
    expect((await remove(kioskAdmin)).status).toBe(403);
    expect((await remove(admin)).status).toBe(200);
    expect((await remove(admin)).status).toBe(404);
  });

  it("needs a title, and keeps it to 200 characters", async () => {
    const res = (title: unknown) => callAs(student, "/cards", { method: "POST", body: { title } });
    expect((await res("")).status).toBe(400);
    expect((await res("x".repeat(201))).status).toBe(400);
    expect((await res("x".repeat(200))).status).toBe(201);
  });

  it("lets members put themselves on a card and take themselves off", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const card = await add(`Team ${tag}`);
    const on = (user: typeof student, method: "PUT" | "DELETE") =>
      callAs(user, `/cards/${card.id}/members/me`, { method });
    const memberIds = async () =>
      ((await jsonAs(mentor, "/cards")) as Card[]).find((c) => c.id === card.id)?.memberIds;

    expect(await memberIds()).toEqual([]);
    expect((await on(student, "PUT")).status).toBe(200);
    expect((await on(student, "PUT")).status).toBe(200); // Twice is still once.
    expect((await on(otherStudent, "PUT")).status).toBe(200);
    expect(await memberIds()).toEqual([student.id, otherStudent.id]);

    expect((await on(student, "DELETE")).status).toBe(200);
    expect(await memberIds()).toEqual([otherStudent.id]);

    expect((await callAs(student, "/cards/999999/members/me", { method: "PUT" })).status).toBe(404);
    expect((await on(kioskAdmin, "PUT")).status).toBe(403);
  });

  it("drops who was on a card when it's deleted", async () => {
    const card = await add(`Gone ${crypto.randomUUID().slice(0, 8)}`);
    await callAs(student, `/cards/${card.id}/members/me`, { method: "PUT" });
    expect((await callAs(admin, `/cards/${card.id}`, { method: "DELETE" })).status).toBe(200);
    const { env } = await import("cloudflare:test");
    const left = await (env as unknown as { PLANNER_DB: D1Database }).PLANNER_DB.prepare(
      "SELECT COUNT(*) AS n FROM card_members WHERE card_id = ?",
    )
      .bind(card.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("names the team's members", async () => {
    const people = (await jsonAs(student, "/cards/people")) as {
      id: string;
      displayName: string;
    }[];
    expect(people.some((p) => p.id === student.id && p.displayName)).toBe(true);
  });

  it("lets a kiosk look but not change anything", async () => {
    expect((await callAs(kioskAdmin, "/cards")).status).toBe(200);
    const res = await callAs(kioskAdmin, "/cards", { method: "POST", body: { title: "Kiosk" } });
    expect(res.status).toBe(403);
  });
});
