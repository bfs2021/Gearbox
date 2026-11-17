// SPDX-License-Identifier: AGPL-3.0-only
// `pnpm discord:commands`: registers Gearbox's slash commands (CHAT_COMMANDS in @g3/auth) with the
// Discord app, replacing its list. Run once per Discord app (production's and staging's) after a
// command is added or changed; Discord shows the change within a minute. Needs the app's
// DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN in the environment. --dry-run prints what it would send.

import { CHAT_COMMANDS } from "../packages/auth/src/chat-commands.ts";
import { registerCommands } from "../packages/discord/src/index.ts";

const commands = CHAT_COMMANDS.map((command) => ({
  name: command.name,
  description: command.description,
  option: { ...command.argument, required: true },
}));

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(commands, null, 2));
} else {
  const { DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN } = process.env;
  if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
    console.error("Set DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN to the Discord app's.");
    process.exit(1);
  }
  await registerCommands({ DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN }, commands);
  console.log(`Registered ${commands.map((c) => `/${c.name}`).join(", ")}.`);
}
