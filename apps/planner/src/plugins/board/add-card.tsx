// SPDX-License-Identifier: AGPL-3.0-only
import { Button, Card, TextField } from "@g3/ui";
import { type FormEvent, useState } from "react";

/** Adding a card, above the board: it goes to the bottom of Not Started. */
export function AddCard({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const ok = await onAdd(title.trim());
    setBusy(false);
    if (ok) setTitle("");
  }

  return (
    <Card>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <TextField
          kind="task"
          aria-label="New card"
          placeholder="Add a card to Not Started"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={busy || !title.trim()}>
          Add card
        </Button>
      </form>
    </Card>
  );
}
