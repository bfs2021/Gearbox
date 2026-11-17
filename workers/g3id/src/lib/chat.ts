// SPDX-License-Identifier: AGPL-3.0-only
import * as discord from "@g3/discord";
import * as slack from "@g3/slack";
import type { AppEnv } from "../types";
import { type TeamDiscord, discordForTeam, removeDiscordInstallation } from "./discord-install";
import { type TeamSlack, slackForTeam } from "./slack-install";

// A team's chat: Slack or Discord, whichever it connected (never both). Everything G3ID sends to
// a team's members or channels goes through here, so apps never know which one a team uses.
// Messages come in Gearbox's chat format (`**bold**`, `[label](url)`, Unicode emoji); Discord
// reads it as it is, and Slack gets it as mrkdwn (`toSlack`).

type Env = AppEnv["Bindings"];

export type ChatProvider = "slack" | "discord";

export const CHAT_LABELS: Record<ChatProvider, string> = { slack: "Slack", discord: "Discord" };

export type TeamChat =
  | ({ provider: "slack" } & TeamSlack)
  | ({ provider: "discord"; bot: { DISCORD_BOT_TOKEN: string } } & TeamDiscord);

/** The team's chat, or null when it has neither. */
export async function chatForTeam(env: Env, teamId: string): Promise<TeamChat | null> {
  const teamDiscord = await discordForTeam(env, teamId);
  if (teamDiscord) {
    return {
      provider: "discord",
      bot: { DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN },
      ...teamDiscord,
    };
  }
  const teamSlack = await slackForTeam(env, teamId);
  return teamSlack ? { provider: "slack", ...teamSlack } : null;
}

/** Which service a team uses for chat, if any (for pages and sign-in methods). */
export async function chatProvider(env: Env, teamId: string): Promise<ChatProvider | null> {
  return (await chatForTeam(env, teamId))?.provider ?? null;
}

/** Whether an id is a user on the team's chat (Slack U…/W…, or a Discord snowflake). */
export function isChatUserId(provider: ChatProvider, id: string): boolean {
  return provider === "slack" ? /^[UW][A-Z0-9]+$/.test(id) : discord.isDiscordId(id);
}

/** Whether an id is a channel on the team's chat (Slack C…/G…, or a Discord snowflake). */
export function isChatChannelId(provider: ChatProvider, id: string): boolean {
  return provider === "slack" ? /^[CG][A-Z0-9]+$/.test(id) : discord.isDiscordId(id);
}

/**
 * After Discord refused a send: if the bot is no longer in the team's server, the team's
 * Discord is forgotten, so its pages show it disconnected instead of failing quietly.
 */
async function checkDiscordStillThere(env: Env, teamId: string, chat: TeamChat, err: unknown) {
  if (chat.provider !== "discord" || !(err instanceof discord.DiscordApiError)) return;
  const guild = await discord.getGuild(chat.bot, chat.guildId).catch(() => undefined);
  if (guild === null) {
    console.error("[discord] the bot is no longer in the team's server", teamId);
    await removeDiscordInstallation(env, teamId);
  }
}

/** A DM from the team's bot to one person on its chat. Throws when it isn't sent. */
export async function sendChatDM(
  env: Env,
  teamId: string,
  chat: TeamChat,
  userId: string,
  text: string,
): Promise<void> {
  try {
    if (chat.provider === "slack") await slack.sendDM(userId, slack.toSlack(text), chat.slack);
    else await discord.sendDM(chat.bot, userId, text);
  } catch (err) {
    await checkDiscordStillThere(env, teamId, chat, err);
    throw err;
  }
}

/** A message the team's bot posted: enough to edit it later (`editInChannel`). */
export type ChatMessageRef = { provider: ChatProvider; channel: string; id: string };

/**
 * A post from the team's bot in one of its channels. Throws when it isn't posted. Gives back the
 * message (on Discord, the first of the pieces a long one is split into).
 */
export async function postToChannel(
  env: Env,
  teamId: string,
  chat: TeamChat,
  channelId: string,
  text: string,
): Promise<ChatMessageRef> {
  try {
    if (chat.provider === "slack") {
      const posted = await slack.sendMessage(channelId, slack.toSlack(text), chat.slack);
      return { provider: "slack", channel: posted.channel, id: posted.ts };
    }
    const [id] = await discord.sendMessage(chat.bot, channelId, text);
    return { provider: "discord", channel: channelId, id };
  } catch (err) {
    await checkDiscordStillThere(env, teamId, chat, err);
    throw err;
  }
}

/** Replaces the text of a message the team's bot posted. Throws when it isn't edited. */
export async function editInChannel(
  env: Env,
  teamId: string,
  chat: TeamChat,
  message: ChatMessageRef,
  text: string,
): Promise<void> {
  if (message.provider !== chat.provider) {
    throw new Error(`The team's chat is ${CHAT_LABELS[chat.provider]} now.`);
  }
  try {
    if (chat.provider === "slack") {
      await slack.editMessage(
        { channel: message.channel, ts: message.id },
        slack.toSlack(text),
        chat.slack,
      );
    } else {
      await discord.editMessage(chat.bot, message.channel, message.id, text);
    }
  } catch (err) {
    await checkDiscordStillThere(env, teamId, chat, err);
    throw err;
  }
}

/** Why a post was refused, in a word apps can show ("not_in_channel", "missing_permissions"). */
export function postError(err: unknown): string {
  if (err instanceof discord.DiscordApiError) {
    if (err.code === discord.DISCORD_ERRORS.missingAccess) return "not_in_channel";
    if (err.code === discord.DISCORD_ERRORS.missingPermissions) return "missing_permissions";
    if (err.code === discord.DISCORD_ERRORS.unknownChannel) return "channel_not_found";
    return err.message;
  }
  const message = err instanceof Error ? err.message : String(err);
  // @g3/slack's errors read "Slack API error: <code>".
  return message.replace(/^Slack API error: /, "");
}

export type ChatChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  /** The bot can post there (Slack: it's in the channel). */
  canPost: boolean;
};

/** The team's channels, by name, for admins choosing one. Throws when the service refuses. */
export async function listChatChannels(chat: TeamChat): Promise<ChatChannel[]> {
  if (chat.provider === "discord") return discord.listChannels(chat.bot, chat.guildId);
  const channels = await slack.listChannels(chat.slack);
  return channels.map(({ id, name, isPrivate, isMember }) => ({
    id,
    name,
    isPrivate,
    canPost: isMember,
  }));
}
