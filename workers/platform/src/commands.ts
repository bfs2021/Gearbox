// SPDX-License-Identifier: AGPL-3.0-only
import { type ChatCommandReply, type ChatCommandRequest, chatCommand } from "@g3/auth";
import type { AppName } from "@g3/site-config";
import type { Context } from "hono";
import { db } from "./lib";
import { BINDINGS, MANIFESTS } from "./registry";
import { enabledApps } from "./team";
import type { AppEnv } from "./types";

// A slash command from a team's chat (CHAT_COMMANDS in @g3/auth), after G3ID found the team and
// the member who typed it: passed to the app that owns it, over this worker's binding to it, but
// only while the team has that app on. Every answer is a reply for that member.

const reply = (text: string): ChatCommandReply => ({ reply: text });

export async function forwardCommand(c: Context<AppEnv>) {
  const teamId = c.req.param("id") ?? "";
  const command = chatCommand(c.req.param("name") ?? "");
  if (!command) return c.json(reply("Gearbox doesn't have that command."));
  const app = (Object.keys(MANIFESTS) as AppName[]).find((a) => MANIFESTS[a].slug === command.app);
  const binding = app ? BINDINGS[app] : undefined;
  if (!app || !binding) return c.json(reply("Gearbox doesn't have that command."));
  if (!(await enabledApps(db(c.env), teamId)).includes(app)) {
    return c.json(reply(`${MANIFESTS[app].name} isn't switched on for your team.`));
  }

  const body = (await c.req.json().catch(() => ({}))) as Partial<ChatCommandRequest>;
  if (typeof body.userId !== "string" || typeof body.text !== "string") {
    return c.json({ error: "Say who typed it and what." }, 400);
  }
  const res = await (c.env[binding] as Fetcher)
    .fetch(
      new Request(
        `http://${command.app}/api/internal/teams/${encodeURIComponent(teamId)}/commands/${command.name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: body.userId,
            text: body.text,
          } satisfies ChatCommandRequest),
        },
      ),
    )
    .catch(() => null);
  const answer = (await res?.json().catch(() => null)) as Partial<ChatCommandReply> | null;
  if (typeof answer?.reply !== "string") {
    console.error("[commands]", command.name, teamId, res?.status);
    return c.json(reply(`${MANIFESTS[app].name} couldn't do that just now. Try again.`));
  }
  return c.json(reply(answer.reply));
}
