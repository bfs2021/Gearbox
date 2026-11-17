// SPDX-License-Identifier: AGPL-3.0-only
import {
  Button,
  Card,
  ChannelPicker,
  ErrorBanner,
  Page,
  PageLoading,
  SuccessBanner,
  chatName,
  useTeamChat,
} from "@g3/ui";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, getErrorMessage } from "../../shared/api";
import { useAuthUser } from "../../shared/auth";

/** Planner's settings, for mentors and admins: where meeting overviews go. */
export function AdminPage() {
  const { isMentor } = useAuthUser();
  const chat = chatName(useTeamChat());
  const [channel, setChannel] = useState<string | null | undefined>(undefined);
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isMentor) return;
    api.settings
      .$get()
      .then(async (res) => {
        if (!res.ok) return setError(await getErrorMessage(res));
        const { overviewChannel } = await res.json();
        setChannel(overviewChannel);
        setSaved(overviewChannel);
      })
      .catch(() => setError("Can't reach Planner. Reload to try again."));
  }, [isMentor]);

  if (!isMentor) return <Navigate to="/" replace />;
  if (channel === undefined) {
    return error ? (
      <Page title="Admin">
        <ErrorBanner message={error} />
      </Page>
    ) : (
      <PageLoading />
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    setDone(false);
    const res = await api.settings
      .$put({ json: { overviewChannel: channel ?? null } })
      .catch(() => null);
    setBusy(false);
    if (!res) return setError("Can't reach Planner. Try again.");
    if (!res.ok) return setError(await getErrorMessage(res));
    setSaved(channel ?? null);
    setDone(true);
  }

  return (
    <Page title="Admin">
      <Card title="Meeting overviews">
        <div className="space-y-4">
          <p className="text-sm text-secondary-500">
            <strong>Send meeting overview</strong> on the board posts what's Not Started and In
            Progress to this {chat} channel. The message updates as cards change, and crosses off
            what gets done.
          </p>
          <div className="space-y-1">
            <label
              htmlFor="overview-channel"
              className="block text-sm font-medium text-secondary-700"
            >
              Channel
            </label>
            <ChannelPicker
              id="overview-channel"
              value={channel}
              onChange={(id) => {
                setChannel(id);
                setDone(false);
              }}
            />
          </div>
          {error && <ErrorBanner message={error} />}
          {done && <SuccessBanner message="Saved." />}
          <Button onClick={save} disabled={busy || channel === saved}>
            Save
          </Button>
        </div>
      </Card>
      <Card title="Adding cards from chat">
        <p className="text-sm text-secondary-500">
          Members add a card to Not Started by typing <code>/gb-add</code> and the card in any{" "}
          {chat} channel, for example <code>/gb-add Order more bolts</code>. Their {chat} account
          has to be linked to Gearbox.
        </p>
      </Card>
    </Page>
  );
}
