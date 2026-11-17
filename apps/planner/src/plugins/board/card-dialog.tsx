// SPDX-License-Identifier: AGPL-3.0-only
import { Button, ConfirmButton, Dialog, Field, TextField, inputClass } from "@g3/ui";
import type { Status } from "@g3/worker-planner";
import { type FormEvent, useState } from "react";
import type { BoardCard } from "../../shared/api";
import { LABELS, STATUSES } from "../../shared/columns";
import { CardPeople, ToggleMe, usePeople } from "./people";

/** A card opened from the board: rename it, move it to another column, or delete it. */
export function CardDialog({
  card,
  canEdit,
  onClose,
  onRename,
  onMove,
  onDelete,
}: {
  card: BoardCard;
  canEdit: boolean;
  onClose: () => void;
  onRename: (title: string) => Promise<boolean>;
  onMove: (status: Status) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(card.title);
  const [status, setStatus] = useState<Status>(card.status);
  const [busy, setBusy] = useState(false);
  const { isAdmin } = usePeople();

  if (!canEdit) {
    return (
      <Dialog title={LABELS[card.status]} onClose={onClose}>
        <div className="space-y-3">
          <p className="text-secondary-900 [overflow-wrap:anywhere]">{card.title}</p>
          <CardPeople card={card} />
        </div>
      </Dialog>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    let ok = true;
    if (title.trim() !== card.title) ok = await onRename(title.trim());
    if (ok && status !== card.status) ok = await onMove(status);
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog title="Card" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title">
          <TextField
            kind="task"
            autoFocus
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-secondary-700">On this card</span>
            <ToggleMe card={card} />
          </div>
          {card.memberIds.length ? (
            <CardPeople card={card} />
          ) : (
            <p className="text-sm text-secondary-500">Nobody yet.</p>
          )}
        </div>
        <Field label="Column">
          <select
            className={`${inputClass} max-w-full`}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isAdmin ? (
            <ConfirmButton
              label="Delete"
              question="Delete this card for everyone?"
              disabled={busy}
              onConfirm={remove}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
