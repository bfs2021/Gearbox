// SPDX-License-Identifier: AGPL-3.0-only
import { Button, ConfirmButton, Dialog, Field, TextField, inputClass } from "@g3/ui";
import { type FormEvent, useState } from "react";
import type { BoardCard } from "../../shared/api";
import { type Column, laneId } from "../../shared/columns";
import { AssignPeople, CardPeople, ToggleMe, usePeople } from "./people";

/**
 * A card opened from the board: rename it, move it to another column, or delete it. Mentors,
 * admins and trusted students also put anyone on it or take them off.
 */
export function CardDialog({
  card,
  columns,
  canEdit,
  onClose,
  onRename,
  onMove,
  onDelete,
}: {
  card: BoardCard;
  /** Every column, left to right, with its name. */
  columns: { column: Column; name: string }[];
  canEdit: boolean;
  onClose: () => void;
  onRename: (title: string) => Promise<boolean>;
  onMove: (column: Column) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(card.title);
  const [column, setColumn] = useState<Column>(card.column);
  const where = columns.find((c) => c.column === card.column)?.name ?? "Card";
  const [busy, setBusy] = useState(false);
  const { isAdmin, canAssign } = usePeople();

  if (!canEdit) {
    return (
      <Dialog title={where} onClose={onClose}>
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
    if (ok && column !== card.column) ok = await onMove(column);
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
          {canAssign ? (
            <AssignPeople card={card} />
          ) : card.memberIds.length ? (
            <CardPeople card={card} />
          ) : (
            <p className="text-sm text-secondary-500">Nobody yet.</p>
          )}
        </div>
        <Field label="Column">
          <select
            className={`${inputClass} max-w-full`}
            value={laneId(column)}
            onChange={(e) => {
              const picked = columns.find((c) => laneId(c.column) === e.target.value);
              if (picked) setColumn(picked.column);
            }}
          >
            {columns.map((c) => (
              <option key={laneId(c.column)} value={laneId(c.column)}>
                {c.name}
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
