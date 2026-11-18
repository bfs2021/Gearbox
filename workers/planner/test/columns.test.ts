// SPDX-License-Identifier: AGPL-3.0-only

import { newTeamId, teamUsers } from "@g3/testing/users";
import { call } from "@g3/testing/worker";
import { callAs, jsonAs } from "@g3/testing/worker";
import { describe, expect, it } from "vitest";

// The board's middle columns: Not Started and Done always stay; mentors and admins add, rename,
// reorder and delete the ones between, and a deleted column's cards go to Not Started.

type Board = {
  columns: { id: number; name: string }[];
  cards: { id: number; title: string; column: "not_started" | "done" | number }[];
};

function team() {
  const users = teamUsers(newTeamId());
  const board = () => jsonAs<Board>(users.student, "/board");
  const addColumn = (name: string, user = users.mentor) =>
    callAs(user, "/columns", { method: "POST", body: { name } });
  const column = async (name: string) =>
    ((await (await addColumn(name)).json()) as { id: number }).id;
  const card = (title: string) =>
    jsonAs<{ id: number }>(users.student, "/cards", { method: "POST", body: { title } }, 201);
  const move = (id: number, column: unknown, index = 99) =>
    callAs(users.student, `/cards/${id}/move`, { method: "PUT", body: { column, index } });
  return { ...users, board, addColumn, column, card, move };
}

describe("middle columns", () => {
  it("are added at the right end, named as the team likes, by mentors and admins", async () => {
    const t = team();
    expect((await t.board()).columns).toEqual([]);
    await t.column("Building");
    expect((await t.addColumn("  Waiting   on parts ", t.admin)).status).toBe(201);
    expect((await t.board()).columns.map((c) => c.name)).toEqual(["Building", "Waiting on parts"]);

    expect((await t.addColumn("Nope", t.student)).status).toBe(403);
    expect((await t.addColumn("Nope", t.kioskAdmin)).status).toBe(403);
    expect((await t.addColumn("")).status).toBe(400);
    expect((await t.addColumn("x".repeat(41))).status).toBe(400);
    // Names are unique, Not Started's and Done's included.
    expect((await t.addColumn("building")).status).toBe(409);
    expect((await t.addColumn("Done")).status).toBe(409);
  });

  it("are renamed and reordered", async () => {
    const t = team();
    const a = await t.column("A");
    const b = await t.column("B");
    const rename = await callAs(t.mentor, `/columns/${a}`, {
      method: "PATCH",
      body: { name: "Alpha" },
    });
    expect(await rename.json()).toEqual({ id: a, name: "Alpha" });
    expect(
      (await callAs(t.mentor, `/columns/${a}`, { method: "PATCH", body: { name: "B" } })).status,
    ).toBe(409);

    const order = (ids: number[]) =>
      callAs(t.mentor, "/columns/order", { method: "PUT", body: { ids } });
    expect((await order([b, a])).status).toBe(200);
    expect((await t.board()).columns.map((c) => c.id)).toEqual([b, a]);
    // Every column, once.
    expect((await order([b])).status).toBe(409);
    expect((await order([b, b])).status).toBe(409);
  });

  it("when deleted, send their cards to the bottom of Not Started, in order", async () => {
    const t = team();
    const doing = await t.column("Doing");
    const waiting = await t.card("Waiting");
    const one = await t.card("One");
    const two = await t.card("Two");
    await t.move(one.id, doing);
    await t.move(two.id, doing);
    expect((await callAs(t.student, `/columns/${doing}`, { method: "DELETE" })).status).toBe(403);

    const res = await callAs(t.mentor, `/columns/${doing}`, { method: "DELETE" });
    expect(await res.json()).toEqual({ moved: 2 });
    const board = await t.board();
    expect(board.columns).toEqual([]);
    expect(board.cards.map((c) => [c.title, c.column])).toEqual([
      ["Waiting", "not_started"],
      ["One", "not_started"],
      ["Two", "not_started"],
    ]);
    expect(waiting.id).toBeLessThan(one.id);
    expect((await callAs(t.mentor, `/columns/${doing}`, { method: "DELETE" })).status).toBe(404);
  });

  it("start with In Progress when the team switches Planner on, unless it has some", async () => {
    const t = team();
    const seed = () => call(`/internal/teams/${t.teamId}/seed`, { method: "POST" });
    expect((await seed()).status).toBe(200);
    expect((await t.board()).columns.map((c) => c.name)).toEqual(["In Progress"]);
    await seed();
    expect((await t.board()).columns).toHaveLength(1);
  });
});
