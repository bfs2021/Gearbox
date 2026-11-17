// SPDX-License-Identifier: AGPL-3.0-only
import { type ChatCommandReply, type ChatCommandRequest, chatCommand } from "@g3/auth";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { coreUserIdentities, coreUsers } from "../db/schema";
import type { AppEnv } from "../types";
import { CHAT_LABELS, type ChatProvider } from "./chat";

// Slash commands from a team's chat (CHAT_COMMANDS in @g3/auth), the same for Slack and Discord:
// routes/slack.ts and routes/discord.ts check the service signed it and find the team, then this
// finds the member who typed it and hands it on. The platform passes it to the app that owns the
// command (only while the team has that app on), so G3ID needs no binding to each app.

type Env = AppEnv["Bindings"];

/** A command someone typed on a team's chat. */
export type ChatCommandUse = {
  provider: ChatProvider;
  /** Null when no team has connected that workspace or server. */
  teamId: string | null;
  /** Their id on the chat service. */
  chatUserId: string;
  /** Without its slash. */
  name: string;
  text: string;
};

/** The team's active member with this chat account linked, or null. */
async function memberFor(env: Env, teamId: string, provider: ChatProvider, chatUserId: string) {
  if (!chatUserId) return null;
  const row = await createDb(env.DB)
    .select({ id: coreUsers.id })
    .from(coreUserIdentities)
    .innerJoin(coreUsers, eq(coreUsers.id, coreUserIdentities.userId))
    .where(
      and(
        eq(coreUserIdentities.provider, provider),
        eq(coreUserIdentities.providerId, chatUserId),
        eq(coreUsers.teamId, teamId),
        eq(coreUsers.status, "active"),
      ),
    )
    .get();
  return row?.id ?? null;
}

/** Runs a command and gives back what to show the person who typed it (Gearbox's chat format). */
export async function runChatCommand(env: Env, use: ChatCommandUse): Promise<string> {
  const command = chatCommand(use.name);
  if (!command) return "Gearbox doesn't have that command.";
  if (!use.teamId) return "This workspace isn't connected to a team on Gearbox.";
  const userId = await memberFor(env, use.teamId, use.provider, use.chatUserId);
  if (!userId) {
    return `Your ${CHAT_LABELS[use.provider]} account isn't linked to a member of this team on Gearbox. Sign in to Gearbox with ${CHAT_LABELS[use.provider]} first.`;
  }
  if (!use.text)
    return `Type it after the command: \`/${command.name} ${command.argument.description.toLowerCase()}\``;
  if (!env.PLATFORM) return "Gearbox can't answer that just now. Try again later.";

  const body: ChatCommandRequest = { userId, text: use.text };
  try {
    const res = await env.PLATFORM.fetch(
      new Request(
        `http://platform/api/internal/teams/${encodeURIComponent(use.teamId)}/commands/${command.name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    );
    const answer = (await res.json().catch(() => ({}))) as Partial<ChatCommandReply> & {
      error?: string;
    };
    if (typeof answer.reply === "string") return answer.reply;
    console.error("[commands]", command.name, res.status, answer.error);
  } catch (err) {
    console.error("[commands]", command.name, err);
  }
  return "Gearbox couldn't do that just now. Try again.";
}
