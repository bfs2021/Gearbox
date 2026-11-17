// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { parseInteraction, privateReply, verifyInteraction } from "../src/index";

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function keys() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    publicKey: hex((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer),
    sign: async (timestamp: string, body: string) =>
      hex(
        await crypto.subtle.sign(
          { name: "Ed25519" },
          pair.privateKey,
          new TextEncoder().encode(timestamp + body),
        ),
      ),
  };
}

const request = (signature: string, timestamp = "1700000000") =>
  new Request("https://id.test/api/discord/interactions", {
    method: "POST",
    headers: { "X-Signature-Ed25519": signature, "X-Signature-Timestamp": timestamp },
  });

describe("verifyInteraction", () => {
  it("accepts what the app's key signed, and nothing else", async () => {
    const { publicKey, sign } = await keys();
    const body = '{"type":1}';
    const env = { DISCORD_PUBLIC_KEY: publicKey };
    expect(await verifyInteraction(request(await sign("1700000000", body)), body, env)).toBe(true);
    // Another body, another timestamp, another key, no signature.
    const signature = await sign("1700000000", body);
    expect(await verifyInteraction(request(signature), '{"type":2}', env)).toBe(false);
    expect(await verifyInteraction(request(signature, "1700000001"), body, env)).toBe(false);
    const other = await keys();
    expect(
      await verifyInteraction(request(signature), body, { DISCORD_PUBLIC_KEY: other.publicKey }),
    ).toBe(false);
    expect(await verifyInteraction(request("nope"), body, env)).toBe(false);
    expect(await verifyInteraction(request(signature), body, { DISCORD_PUBLIC_KEY: "" })).toBe(
      false,
    );
  });
});

describe("parseInteraction", () => {
  it("reads a ping and a command, in a server or not", () => {
    expect(parseInteraction('{"type":1}')).toEqual({ type: "ping" });
    const command = {
      type: 2,
      guild_id: "11",
      channel_id: "22",
      member: { user: { id: "33" } },
      data: { name: "gb-add", options: [{ name: "task", type: 3, value: "Wire it" }] },
    };
    expect(parseInteraction(JSON.stringify(command))).toEqual({
      type: "command",
      command: {
        name: "gb-add",
        options: { task: "Wire it" },
        userId: "33",
        guildId: "11",
        channelId: "22",
      },
    });
    expect(parseInteraction("not json")).toEqual({ type: "other" });
    expect(parseInteraction('{"type":3}')).toEqual({ type: "other" });
  });

  it("answers only the person who typed it, never pinging anyone", () => {
    expect(privateReply("Added @everyone")).toEqual({
      type: 4,
      data: { content: "Added @everyone", flags: 64, allowed_mentions: { parse: [] } },
    });
  });
});
