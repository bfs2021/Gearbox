// SPDX-License-Identifier: AGPL-3.0-only
import { Button, ErrorBanner, SuccessBanner, chatName, useTeamChat } from "@g3/ui";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../shared/api";

/** When an overview last went, as the viewer reads a time. */
const sentAt = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Send meeting overview (mentors and admins): posts the board to the team's chat. */
export function SendOverview() {
  const chat = chatName(useTeamChat());
  const [last, setLast] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    api.overviews.latest
      .$get()
      .then(async (res) => res.ok && setLast((await res.json()).postedAt))
      .catch(() => {});
  }, []);

  async function send() {
    setBusy(true);
    setResult(null);
    // The date in its heading is today where the sender is.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await api.overviews.$post({ json: { timeZone } }).catch(() => null);
    setBusy(false);
    if (!res) return setResult({ ok: false, message: "Can't reach Planner. Try again." });
    if (!res.ok) return setResult({ ok: false, message: await getErrorMessage(res) });
    setLast((await res.json()).postedAt);
    setResult({ ok: true, message: `Sent to ${chat}. It updates as cards change.` });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={send} disabled={busy}>
        Send meeting overview
      </Button>
      {last && <span className="text-xs text-secondary-500">Last sent {sentAt(last)}</span>}
      {result &&
        (result.ok ? (
          <SuccessBanner message={result.message} />
        ) : (
          <ErrorBanner message={result.message} />
        ))}
    </div>
  );
}
