// SPDX-License-Identifier: AGPL-3.0-only
// Slash commands on a team's chat, Slack or Discord. Every command starts with "gb-" (Slack shares
// command names across a workspace's apps). G3ID receives them from both services, finds the team
// and the member who typed it, and hands it to the app that owns it:
//   POST /api/internal/teams/:teamId/commands/:name  { userId, text }  →  { reply }
// The reply is shown only to that member. No imports here: `scripts/discord-commands.ts` reads it.
//
// A new command: add it below, handle it in its app, give G3ID a service binding to the app
// (`APP_BINDINGS` in workers/g3id/src/lib/commands.ts), add it to the Slack apps (docs/deploy.md,
// "Slash commands") and run `pnpm discord:commands`.

export type ChatCommand = {
  /** Without its slash: "gb-add". */
  name: string;
  /** The app that answers it (its manifest's slug). */
  app: string;
  /** What it does, as Discord's command list and Slack's settings show it (100 characters). */
  description: string;
  /** The text after the command: its name and hint on Discord, its usage hint on Slack. */
  argument: { name: string; description: string };
};

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    name: "gb-add",
    app: "planner",
    description: "Add a card to Not Started on your team's Planner board.",
    argument: { name: "task", description: "What needs doing" },
  },
];

/** The command with this name (no slash), if Gearbox has one. */
export const chatCommand = (name: string) =>
  CHAT_COMMANDS.find((command) => command.name === name.replace(/^\//, ""));

/** What G3ID sends the app: the member who typed it (their G3ID id) and the text after it. */
export type ChatCommandRequest = { userId: string; text: string };

/** What the app answers: the message only that member sees, in Gearbox's chat format. */
export type ChatCommandReply = { reply: string };
