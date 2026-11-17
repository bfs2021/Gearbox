// SPDX-License-Identifier: AGPL-3.0-only
import { exports } from "cloudflare:workers";
import { snowflake } from "@g3/testing/discord";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { coreUserIdentities } from "../src/db/schema";
import { saveDiscordInstallation } from "../src/lib/discord-install";
import { newId } from "../src/lib/id";
import { saveInstallation } from "../src/lib/slack-install";
import { createTeam, createUser, g3id, testEnv } from "./helpers";

// Gearbox's slash commands (/gb-add, CHAT_COMMANDS in @g3/auth) from Slack and Discord: checked as
// signed by the service, matched to the team and the member who typed it, and handed to the
// platform (here a stub that answers with what it got). And editing a message the bot posted.

/** The private half of DISCORD_PUBLIC_KEY in vitest.config.mts (a key for these tests only). */
const DISCORD_PRIVATE_KEY = "MC4CAQAwBQYDK2VwBCIEIG9nTdhPW4xdm9XYL5i/Om45EU0Y1aVCu1ns5WdhkTp/";

const raw = (path: string, body: string, headers: Record<string, string>) =>
  exports.default.fetch(new Request(`http://g3id${path}`, { method: "POST", headers, body }));

async function linked(teamId: string, provider: "slack" | "discord", providerId: string) {
  const userId = await createUser({ teamId });
  const now = Math.floor(Date.now() / 1000);
  await createDb(testEnv.DB)
    .insert(coreUserIdentities)
    .values({ id: newId(), userId, provider, providerId, createdAt: now, updatedAt: now });
  return userId;
}

describe("slash commands from Slack", () => {
  async function slackTeam() {
    const team = await createTeam();
    const workspaceId = `T${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    await saveInstallation(testEnv, {
      teamId: team,
      workspaceId,
      workspaceName: "Their Slack",
      botUserId: "UBOT",
      botToken: "xoxb-team",
      installedBy: null,
    });
    return { team, workspaceId };
  }

  async function command(fields: Record<string, string>, secret = testEnv.SLACK_SIGNING_SECRET) {
    const body = new URLSearchParams({
      command: "/gb-add",
      channel_id: "C1",
      ...fields,
    }).toString();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`v0:${timestamp}:${body}`),
    );
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return raw("/slack/commands/gb", body, {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": `v0=${hex}`,
    });
  }

  it("hands a linked member's command to the platform, and shows only them the reply", async () => {
    const { team, workspaceId } = await slackTeam();
    const userId = await linked(team, "slack", "U0LINKED1");
    const res = await command({
      team_id: workspaceId,
      user_id: "U0LINKED1",
      text: " Order bolts ",
    });
    expect(await res.json()).toEqual({
      response_type: "ephemeral",
      text: `gb-add for ${team}: ${userId} said "Order bolts"`,
    });
  });

  it("asks someone not linked to the team to sign in first", async () => {
    const { workspaceId } = await slackTeam();
    const res = await command({ team_id: workspaceId, user_id: "U0STRANGER", text: "Hi" });
    expect(((await res.json()) as { text: string }).text).toContain("isn't linked");
  });

  it("says how to use it, with nothing after it", async () => {
    const { team, workspaceId } = await slackTeam();
    await linked(team, "slack", "U0EMPTY01");
    const res = await command({ team_id: workspaceId, user_id: "U0EMPTY01", text: "" });
    expect(((await res.json()) as { text: string }).text).toContain("/gb-add");
  });

  it("knows no team for a workspace nobody connected, and refuses what Slack didn't sign", async () => {
    const res = await command({ team_id: "TNOBODY", user_id: "U1", text: "Hi" });
    expect(((await res.json()) as { text: string }).text).toContain("isn't connected");
    const forged = await command({ team_id: "TNOBODY", user_id: "U1", text: "Hi" }, "wrong");
    expect(forged.status).toBe(401);
  });
});

describe("slash commands from Discord", () => {
  async function signed(body: unknown) {
    const text = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const pkcs8 = Uint8Array.from(atob(DISCORD_PRIVATE_KEY), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" },
      key,
      new TextEncoder().encode(timestamp + text),
    );
    const hex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return raw("/discord/interactions", text, {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": hex,
      "X-Signature-Timestamp": timestamp,
    });
  }

  it("answers Discord's check that the address works", async () => {
    expect(await (await signed({ type: 1 })).json()).toEqual({ type: 1 });
  });

  it("refuses what Discord didn't sign", async () => {
    const res = await raw("/discord/interactions", JSON.stringify({ type: 1 }), {
      "X-Signature-Ed25519": "00".repeat(64),
      "X-Signature-Timestamp": "1",
    });
    expect(res.status).toBe(401);
  });

  it("hands a linked member's command to the platform, and shows only them the reply", async () => {
    const team = await createTeam();
    const guildId = snowflake("5");
    await saveDiscordInstallation(testEnv, {
      teamId: team,
      guildId,
      guildName: "S",
      installedBy: null,
    });
    const discordId = snowflake("5");
    const userId = await linked(team, "discord", discordId);
    const res = await signed({
      type: 2,
      guild_id: guildId,
      channel_id: snowflake("1"),
      member: { user: { id: discordId } },
      data: { name: "gb-add", options: [{ name: "task", type: 3, value: "Wire it" }] },
    });
    expect(await res.json()).toMatchObject({
      type: 4,
      data: { content: `gb-add for ${team}: ${userId} said "Wire it"`, flags: 64 },
    });
  });
});

describe("editing a posted message", () => {
  const post = (teamId: string, body: unknown) =>
    g3id(`/internal/teams/${teamId}/chat/message`, { method: "POST", body });
  const edit = (teamId: string, body: unknown) =>
    g3id(`/internal/teams/${teamId}/chat/message`, { method: "PATCH", body });

  it("on Slack: posting gives back the message, and an edit replaces its text", async () => {
    const team = await createTeam();
    await saveInstallation(testEnv, {
      teamId: team,
      workspaceId: `T${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      workspaceName: "Their Slack",
      botUserId: "UBOT",
      botToken: "xoxb-team",
      installedBy: null,
    });
    const posted = (await (await post(team, { channel: "C0ABC", text: "One" })).json()) as {
      message: { provider: string; channel: string; id: string };
    };
    expect(posted.message).toMatchObject({ provider: "slack", channel: "C0ABC" });
    expect((await edit(team, { message: posted.message, text: "~~One~~" })).status).toBe(200);
    const updated = (await (await fetch("https://slack.com/__updated")).json()) as {
      ts: string;
      text: string;
    }[];
    expect(updated).toContainEqual(
      expect.objectContaining({ ts: posted.message.id, text: "~One~" }),
    );

    // Gone: the service's reason. A message from the team's chat before it changed: refused.
    const gone = await edit(team, { message: { ...posted.message, channel: "CGONE1" }, text: "x" });
    expect(await gone.json()).toEqual({ error: "message_not_found" });
    const discordMessage = { provider: "discord", channel: snowflake("1"), id: snowflake("1") };
    expect((await edit(team, { message: discordMessage, text: "x" })).status).toBe(409);
  });

  it("on Discord: edits the message in place", async () => {
    const team = await createTeam();
    await saveDiscordInstallation(testEnv, {
      teamId: team,
      guildId: snowflake("5"),
      guildName: "S",
      installedBy: null,
    });
    const channel = snowflake("2");
    const posted = (await (await post(team, { channel, text: "One" })).json()) as {
      message: { provider: string; channel: string; id: string };
    };
    expect(posted.message).toMatchObject({ provider: "discord", channel });
    expect((await edit(team, { message: posted.message, text: "~~One~~" })).status).toBe(200);
    const edited = (await (await fetch("https://discord.com/__edited")).json()) as {
      message: string;
      content: string;
    }[];
    expect(edited).toContainEqual({ channel, message: posted.message.id, content: "~~One~~" });
    expect((await edit(team, { message: posted.message, text: "x".repeat(2001) })).status).toBe(
      400,
    );
  });
});
