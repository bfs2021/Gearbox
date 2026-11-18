// SPDX-License-Identifier: AGPL-3.0-only
import { Button, Card, ErrorBanner, Field, Loading, PersonPicker } from "@g3/ui";
import type { InferResponseType } from "hono/client";
import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "../../shared/api";

// Trusted students, for mentors and admins: they put anyone on a card or take them off, like
// mentors and admins.

type Trusted = InferResponseType<(typeof api.trusted)["$get"], 200>;

export function TrustedCard() {
  const [data, setData] = useState<Trusted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.trusted.$get().catch(() => null);
    if (!res) return setError("Can't reach Planner. Reload to try again.");
    if (!res.ok) return setError(await getErrorMessage(res));
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(
    call: () => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
  ) {
    setBusy(true);
    setError(null);
    const res = await call().catch(() => null);
    if (!res) setError("Can't reach Planner. Try again.");
    else if (!res.ok) setError(await getErrorMessage(res));
    await load();
    setBusy(false);
    return !!res?.ok;
  }

  return (
    <Card title="Trusted students">
      <div className="space-y-4">
        <p className="text-sm text-secondary-500">
          They can put anyone on a card or take them off, like mentors and admins.
        </p>
        {error && <ErrorBanner message={error} />}
        {!data && !error && <Loading />}
        {data?.trusted.length === 0 && (
          <p className="text-sm text-secondary-500">No trusted students yet.</p>
        )}
        {data && data.trusted.length > 0 && (
          <ul className="divide-y divide-line">
            {data.trusted.map((t) => (
              <li key={t.userId} className="flex items-center justify-between gap-2 py-2">
                <span
                  className="min-w-0 truncate text-sm text-secondary-900"
                  title={t.displayName ?? undefined}
                >
                  {t.displayName ?? "Former member"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api.trusted[":userId"].$delete({ param: { userId: t.userId } }))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <div className="border-t border-line pt-4">
            <Field label="Add a student">
              <PersonPicker
                people={data.students}
                label="Add a trusted student"
                placeholder="Search students…"
                emptyText="Every student is trusted."
                disabled={busy}
                onPick={(userId) =>
                  void run(() => api.trusted[":userId"].$put({ param: { userId } }))
                }
              />
            </Field>
          </div>
        )}
      </div>
    </Card>
  );
}
