// SPDX-License-Identifier: AGPL-3.0-only
import { admin, kioskAdmin, mentor, otherStudent, student } from "@g3/testing/users";
import { callAs, jsonAs } from "@g3/testing/worker";
import { describe, expect, it } from "vitest";

type Card = { id: number; memberIds: string[] };
type Trusted = {
  trusted: { userId: string; displayName: string | null }[];
  students: { id: string; displayName: string }[];
};

const add = (title: string) =>
  jsonAs<Card>(student, "/cards", { method: "POST", body: { title } }, 201);

const onCard = async (card: Card) =>
  ((await jsonAs(student, "/cards")) as Card[]).find((c) => c.id === card.id)?.memberIds;

const me = async (user: typeof student) => (await jsonAs(user, "/me")) as { canAssign: boolean };

// One file's storage is shared by its tests, so these run in order: student is trusted part way.
describe("putting other people on cards", () => {
  it("lets mentors and admins put anyone on a card and take them off", async () => {
    const card = await add(`Shared ${crypto.randomUUID().slice(0, 8)}`);
    for (const user of [mentor, admin]) {
      expect(
        (await callAs(user, `/cards/${card.id}/members/${otherStudent.id}`, { method: "PUT" }))
          .status,
      ).toBe(200);
      expect(await onCard(card)).toEqual([otherStudent.id]);
      await callAs(user, `/cards/${card.id}/members/${otherStudent.id}`, { method: "DELETE" });
      expect(await onCard(card)).toEqual([]);
    }
    expect((await me(mentor)).canAssign).toBe(true);
  });

  it("doesn't let students or kiosks, until a mentor trusts the student", async () => {
    const card = await add(`Student ${crypto.randomUUID().slice(0, 8)}`);
    const put = (user: typeof student) =>
      callAs(user, `/cards/${card.id}/members/${otherStudent.id}`, { method: "PUT" });
    expect((await put(student)).status).toBe(403);
    expect((await put(kioskAdmin)).status).toBe(403);
    expect((await me(student)).canAssign).toBe(false);

    const before = (await jsonAs(mentor, "/trusted")) as Trusted;
    expect(before.students.some((s) => s.id === student.id)).toBe(true);
    // Mentors and admins aren't offered: they already can.
    expect(before.students.some((s) => s.id === mentor.id || s.id === admin.id)).toBe(false);

    expect((await callAs(student, `/trusted/${otherStudent.id}`, { method: "PUT" })).status).toBe(
      403,
    );
    expect((await callAs(mentor, `/trusted/${student.id}`, { method: "PUT" })).status).toBe(200);
    const after = (await jsonAs(mentor, "/trusted")) as Trusted;
    expect(after.trusted.map((t) => t.userId)).toContain(student.id);
    expect(after.students.some((s) => s.id === student.id)).toBe(false);

    expect((await me(student)).canAssign).toBe(true);
    expect((await put(student)).status).toBe(200);
    expect(await onCard(card)).toEqual([otherStudent.id]);
  });

  it("only puts the team's active members on a card", async () => {
    const card = await add(`Stranger ${crypto.randomUUID().slice(0, 8)}`);
    const res = await callAs(mentor, `/cards/${card.id}/members/nobody-here`, { method: "PUT" });
    expect(res.status).toBe(400);
    expect(
      (await callAs(mentor, `/cards/999999/members/${otherStudent.id}`, { method: "PUT" })).status,
    ).toBe(404);
    expect((await callAs(mentor, "/trusted/nobody-here", { method: "PUT" })).status).toBe(400);
  });

  it("stops a student once they're no longer trusted", async () => {
    expect((await callAs(admin, `/trusted/${student.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await me(student)).canAssign).toBe(false);
    const card = await add(`Untrusted ${crypto.randomUUID().slice(0, 8)}`);
    expect(
      (await callAs(student, `/cards/${card.id}/members/${otherStudent.id}`, { method: "PUT" }))
        .status,
    ).toBe(403);
  });
});
