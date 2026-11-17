// SPDX-License-Identifier: AGPL-3.0-only
// A team's members with their roles, and messages to them on the team's chat (Slack or Discord,
// whichever it connected), from G3ID over the service binding (its /api/internal routes are never
// reachable through the gateway). Apps keep no list of people of their own, never hold a team's
// chat token, and never know which chat a team uses.
//
// Messages are written in Gearbox's chat format, which Discord reads as it is and G3ID turns into
// Slack's mrkdwn: **bold**, [label](https://...), "> " quotes, Unicode emoji (not :names:) and line
// breaks.

export type Member = {
  id: string;
  displayName: string;
  email: string;
  status: "pending" | "active" | "rejected" | "merged";
  isAdmin: boolean;
  isMentor: boolean;
  /** Has linked the team's chat (Slack or Discord), so the team's bot can DM them. */
  hasChat?: boolean;
};

/** The team's members (any status), or null when G3ID can't be reached. */
export async function teamMembers(
  env: { G3ID: Fetcher },
  teamId: string,
): Promise<Member[] | null> {
  const res = await env.G3ID.fetch(
    new Request(`http://g3id/api/internal/teams/${encodeURIComponent(teamId)}/members`),
  );
  if (!res.ok) return null;
  return (await res.json()) as Member[];
}

/** The team's active members. */
export async function activeMembers(env: { G3ID: Fetcher }, teamId: string) {
  return (await teamMembers(env, teamId))?.filter((m) => m.status === "active") ?? null;
}

/**
 * Sends a direct message from the team's own bot to members by their G3ID ids. Only active
 * members with the team's chat linked get it. Returns how many were sent (0 when the team has no
 * chat, or G3ID couldn't be reached); it never throws, so callers can fire and forget.
 */
export async function sendMemberDM(
  env: { G3ID: Fetcher },
  teamId: string,
  userIds: string[],
  text: string,
): Promise<number> {
  try {
    const res = await env.G3ID.fetch(
      new Request(`http://g3id/api/internal/teams/${encodeURIComponent(teamId)}/chat/dm-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, text }),
      }),
    );
    if (res.ok) return ((await res.json()) as { sent?: number }).sent ?? 0;
    if (res.status !== 404) {
      console.error("[chat] member DM failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[chat] member DM failed", err);
  }
  return 0;
}

/** A message the team's bot posted, for editing it later: opaque to apps, kept as it comes. */
export type TeamMessageRef = { provider: "slack" | "discord"; channel: string; id: string };

type Posted = { ok: true; message: TeamMessageRef | null } | { ok: false; error: string };

/** A call to G3ID's /chat/message; never throws, giving back why it failed instead. */
async function chatMessage(
  env: { G3ID: Fetcher },
  teamId: string,
  method: "POST" | "PATCH",
  body: object,
): Promise<Posted> {
  try {
    const res = await env.G3ID.fetch(
      new Request(`http://g3id/api/internal/teams/${encodeURIComponent(teamId)}/chat/message`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const answer = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: TeamMessageRef;
    };
    if (res.ok) return { ok: true, message: answer.message ?? null };
    return { ok: false, error: answer.error ?? `G3ID answered ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Posts to one of the team's channels (a Slack or Discord channel id) from its own bot. Never
 * throws: gives back why it wasn't posted (the team has no chat, or the service's refusal, like
 * "not_in_channel").
 */
export async function sendTeamMessage(
  env: { G3ID: Fetcher },
  teamId: string,
  channel: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const posted = await chatMessage(env, teamId, "POST", { channel, text });
  return posted.ok ? { ok: true } : posted;
}

/**
 * Posts a message the app will edit later (`editTeamMessage`): a list kept up to date. Keep it
 * under 2,000 characters, one Discord message. Never throws.
 */
export async function postTeamMessage(
  env: { G3ID: Fetcher },
  teamId: string,
  channel: string,
  text: string,
): Promise<{ ok: true; message: TeamMessageRef } | { ok: false; error: string }> {
  const posted = await chatMessage(env, teamId, "POST", { channel, text });
  if (!posted.ok) return posted;
  if (!posted.message) return { ok: false, error: "G3ID didn't say which message it posted." };
  return { ok: true, message: posted.message };
}

/**
 * Replaces the text of a message `postTeamMessage` posted. Never throws: gives back why it wasn't
 * edited (the message was deleted, the team's chat changed, ...).
 */
export async function editTeamMessage(
  env: { G3ID: Fetcher },
  teamId: string,
  message: TeamMessageRef,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const edited = await chatMessage(env, teamId, "PATCH", { message, text });
  return edited.ok ? { ok: true } : edited;
}

/**
 * Whether the team has an app on (the platform's app library, through G3ID): null when that can't
 * be told. For a feature that needs another app, so it isn't asked for while that app is off.
 */
export async function teamHasApp(
  env: { G3ID: Fetcher },
  teamId: string,
  app: string,
): Promise<boolean | null> {
  try {
    const res = await env.G3ID.fetch(
      new Request(`http://g3id/api/internal/teams/${encodeURIComponent(teamId)}/apps`),
    );
    if (!res.ok) return null;
    return ((await res.json()) as { apps: string[] }).apps.includes(app);
  } catch {
    return null;
  }
}
