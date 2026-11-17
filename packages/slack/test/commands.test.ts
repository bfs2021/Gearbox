// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { parseCommand, plainChatText, privateReply, toSlack } from "../src/index";

describe("strikethrough", () => {
  it("becomes Slack's single tildes", () => {
    expect(toSlack("• ~~Order bolts~~ (Sam)")).toBe("• ~Order bolts~ (Sam)");
  });
});

describe("plainChatText", () => {
  it("keeps someone's text from turning into formatting or a link", () => {
    expect(plainChatText("**Big** [x](https://evil) ~~no~~ `code` a|b")).toBe(
      "Big (x)(https://evil) no code ab",
    );
    expect(plainChatText("  two\n lines ")).toBe("two lines");
  });
});

describe("slash commands", () => {
  it("are read from Slack's form", () => {
    const body = new URLSearchParams({
      command: "/gb-add",
      text: "  Order bolts ",
      user_id: "U1",
      team_id: "T1",
      channel_id: "C1",
    }).toString();
    expect(parseCommand(body)).toEqual({
      command: "/gb-add",
      text: "Order bolts",
      userId: "U1",
      workspaceId: "T1",
      channelId: "C1",
    });
  });

  it("are answered only to the person who typed them, in Slack's format", () => {
    expect(privateReply("**Added** <x>")).toEqual({
      response_type: "ephemeral",
      text: "*Added* &lt;x&gt;",
    });
  });
});
