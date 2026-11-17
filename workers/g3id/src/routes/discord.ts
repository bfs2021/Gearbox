// SPDX-License-Identifier: AGPL-3.0-only
import { chatCommand } from "@g3/auth";
import { parseInteraction, pong, privateReply, verifyInteraction } from "@g3/discord";
import { Hono } from "hono";
import { runChatCommand } from "../lib/commands";
import { teamForGuild } from "../lib/discord-install";
import type { AppEnv } from "../types";

// The Discord app's Interactions Endpoint URL (`id.<platform>/api/discord/interactions`): Discord
// sends every use of Gearbox's slash commands here, signed with the app's key (DISCORD_PUBLIC_KEY),
// and shows the answer only to the person who typed it. Commands: CHAT_COMMANDS in @g3/auth,
// registered with `pnpm discord:commands`.

export const discordRouter = new Hono<AppEnv>().post("/interactions", async (c) => {
  const rawBody = await c.req.text();
  const key = { DISCORD_PUBLIC_KEY: c.env.DISCORD_PUBLIC_KEY ?? "" };
  if (!(await verifyInteraction(c.req.raw, rawBody, key))) {
    return c.json({ error: "Bad signature." }, 401);
  }
  const interaction = parseInteraction(rawBody);
  if (interaction.type === "ping") return c.json(pong());
  if (interaction.type !== "command") return c.json({ error: "Not handled." }, 400);

  const { command } = interaction;
  const argument = chatCommand(command.name)?.argument.name;
  const reply = await runChatCommand(c.env, {
    provider: "discord",
    teamId: command.guildId ? await teamForGuild(c.env, command.guildId) : null,
    chatUserId: command.userId,
    name: command.name,
    text: (argument ? command.options[argument] : "")?.trim() ?? "",
  });
  return c.json(privateReply(reply));
});
