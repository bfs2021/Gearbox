// SPDX-License-Identifier: AGPL-3.0-only
import { Button, Card, ConfirmQuestion, ErrorBanner, Loading, TextField, focusRing } from "@g3/ui";
import { MAX_COLUMNS, MAX_COLUMN_NAME } from "@g3/worker-planner/limits";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { type BoardData, api, getErrorMessage } from "../../shared/api";
import type { MiddleColumn } from "../../shared/columns";

// The board's columns, for mentors and admins: Not Started and Done always stay; the ones between
// are added, renamed, moved and deleted here. A deleted column's cards go to Not Started.

const iconButton = `rounded-md p-1.5 text-secondary-500 hover:bg-inset hover:text-secondary-900 disabled:opacity-30 disabled:hover:bg-transparent ${focusRing}`;

function IconButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={props.danger ? `${iconButton} hover:bg-red-50 hover:text-red-700` : iconButton}
    >
      {props.children}
    </button>
  );
}

/** A column's name: a new column's, or a new name for one. */
function NameForm({
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onSubmit(name.trim());
    setBusy(false);
    if (ok && !onCancel) setName("");
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
      <TextField
        kind="column"
        autoFocus={!!onCancel}
        aria-label="Column name"
        placeholder="Column name"
        maxLength={MAX_COLUMN_NAME}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel?.();
        }}
        className="min-w-0 flex-1"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === initial}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

const cardCount = (n: number) => (n === 1 ? "1 card" : `${n} cards`);

/** Not Started and Done: always there, never changed. */
function FixedRow({ name, cards, note }: { name: string; cards: number; note: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium text-secondary-900">{name}</p>
        <p className="text-xs text-secondary-500">{note}</p>
      </div>
      <span className="shrink-0 text-xs text-secondary-500">{cardCount(cards)}</span>
    </li>
  );
}

export function ColumnsCard() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await api.board.$get().catch(() => null);
    if (!res) return setError("Can't reach Planner. Reload to try again.");
    if (!res.ok) return setError(await getErrorMessage(res));
    setBoard(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a change, then shows the columns as saved, or why it didn't work. */
  async function change(
    call: () => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
  ) {
    setError(null);
    const res = await call().catch(() => null);
    const failed = !res
      ? "Can't reach Planner. Try again."
      : !res.ok
        ? await getErrorMessage(res)
        : null;
    await load();
    if (failed) setError(failed);
    return !failed;
  }

  if (!board) {
    return <Card title="Columns">{error ? <ErrorBanner message={error} /> : <Loading />}</Card>;
  }

  const count = (column: "not_started" | "done" | number) =>
    board.cards.filter((card) => card.column === column).length;
  const middle = board.columns;

  function move(column: MiddleColumn, by: -1 | 1) {
    const ids = middle.map((c) => c.id);
    const at = ids.indexOf(column.id);
    [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
    change(() => api.columns.order.$put({ json: { ids } }));
  }

  return (
    <Card title="Columns">
      <div className="space-y-4">
        <p className="text-sm text-secondary-500">
          Cards move from Not Started to Done through the columns between them, in this order.
        </p>
        {error && <ErrorBanner message={error} />}
        <ul className="divide-y divide-line">
          <FixedRow
            name="Not Started"
            cards={count("not_started")}
            note="Always first. New cards start here."
          />
          {middle.map((column, i) => (
            <li key={column.id} className="space-y-2 py-2.5">
              {renaming === column.id ? (
                <NameForm
                  initial={column.name}
                  submitLabel="Rename"
                  onSubmit={async (name) => {
                    const ok = await change(() =>
                      api.columns[":id"].$patch({
                        param: { id: String(column.id) },
                        json: { name },
                      }),
                    );
                    if (ok) setRenaming(null);
                    return ok;
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p
                    className="min-w-0 truncate font-medium text-secondary-900"
                    title={column.name}
                  >
                    {column.name}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-2 text-xs text-secondary-500">
                      {cardCount(count(column.id))}
                    </span>
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(column, -1)}>
                      <ChevronUp aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={i === middle.length - 1}
                      onClick={() => move(column, 1)}
                    >
                      <ChevronDown aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton label="Rename" onClick={() => setRenaming(column.id)}>
                      <Pencil aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton label="Delete column" danger onClick={() => setDeleting(column.id)}>
                      <Trash2 aria-hidden className="size-4" />
                    </IconButton>
                  </div>
                </div>
              )}
              {deleting === column.id && (
                <ConfirmQuestion
                  question={
                    count(column.id)
                      ? `Delete ${column.name}? Its ${cardCount(count(column.id))} go to the bottom of Not Started.`
                      : `Delete ${column.name}?`
                  }
                  confirmLabel="Delete column"
                  keepLabel="Keep it"
                  onConfirm={async () => {
                    const id = String(column.id);
                    if (await change(() => api.columns[":id"].$delete({ param: { id } }))) {
                      setDeleting(null);
                    }
                  }}
                  onKeep={() => setDeleting(null)}
                />
              )}
            </li>
          ))}
          {!middle.length && (
            <li className="py-2.5 text-sm text-secondary-500">
              No columns between Not Started and Done yet. Add one below.
            </li>
          )}
          <FixedRow name="Done" cards={count("done")} note="Always last." />
        </ul>
        {middle.length < MAX_COLUMNS ? (
          <NameForm
            submitLabel="Add column"
            onSubmit={(name) => change(() => api.columns.$post({ json: { name } }))}
          />
        ) : (
          <p className="text-sm text-secondary-500">
            A board can have up to {MAX_COLUMNS} columns between Not Started and Done.
          </p>
        )}
      </div>
    </Card>
  );
}
