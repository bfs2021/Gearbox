// SPDX-License-Identifier: AGPL-3.0-only
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type UniqueIdentifier,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ConfirmQuestion, Dialog, ErrorBanner, Page, PageLoading } from "@g3/ui";
import type { Status } from "@g3/worker-planner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BoardCard, api, getErrorMessage } from "../../shared/api";
import { useAuthUser } from "../../shared/auth";
import { LABELS, STATUSES } from "../../shared/columns";
import { AddCard } from "./add-card";
import { CardDialog } from "./card-dialog";
import { BoardColumn, CardFace } from "./column";
import { type People, PeopleContext } from "./people";

// The team's board: cards in three columns, dragged between and within them. Everyone's board
// follows the others' by asking for the cards every few seconds.

/** How often the board asks for everyone's changes. */
const POLL_MS = 5000;

export type Columns = Record<Status, BoardCard[]>;

/** The cards in their columns, top first. */
function columnsOf(cards: BoardCard[]): Columns {
  const columns: Columns = { not_started: [], in_progress: [], done: [] };
  for (const card of [...cards].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
    columns[card.status].push(card);
  }
  return columns;
}

/** The column a draggable or droppable id is in: a column's own id, or a card's. */
function columnOf(columns: Columns, id: UniqueIdentifier): Status | null {
  if (STATUSES.includes(id as Status)) return id as Status;
  return STATUSES.find((status) => columns[status].some((card) => card.id === id)) ?? null;
}

export function BoardPage() {
  const { canEdit, isAdmin, userId: me } = useAuthUser();
  const [columns, setColumns] = useState<Columns | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<BoardCard | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  /** The card an admin asked to delete, waiting for their yes. */
  const [deleting, setDeleting] = useState<BoardCard | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const known = useRef(names);
  known.current = names;
  /** When the names were last asked for: again for someone new on a card, a minute apart. */
  const namesAsked = useRef(0);
  /** The board as it was when a drag started, to put back if it's canceled. */
  const before = useRef<Columns | null>(null);
  /** Changes on their way: a poll's answer from before them would undo them on screen. */
  const busy = useRef(0);

  const loadNames = useCallback(async () => {
    namesAsked.current = Date.now();
    const res = await api.cards.people.$get().catch(() => null);
    if (res?.ok) setNames(new Map((await res.json()).map((p) => [p.id, p.displayName])));
  }, []);

  const refresh = useCallback(async () => {
    if (before.current || busy.current > 0) return;
    const res = await api.cards.$get().catch(() => null);
    if (!res) return setError("Can't reach Planner. Retrying…");
    if (!res.ok) return setError(await getErrorMessage(res));
    const cards = await res.json();
    if (before.current || busy.current > 0) return;
    setColumns(columnsOf(cards));
    setError(null);
    const someoneNew = cards.some((c) => c.memberIds.some((id) => !known.current.has(id)));
    if (someoneNew && Date.now() - namesAsked.current > 60_000) loadNames();
  }, [loadNames]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  /** Runs a change, then shows the board as saved (or the error and the board as it is). */
  const change = useCallback(
    async (call: () => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>) => {
      busy.current++;
      let failed: string | null = null;
      try {
        const res = await call();
        if (!res.ok) failed = await getErrorMessage(res);
      } catch {
        failed = "Can't reach Planner. Try again.";
      } finally {
        busy.current--;
      }
      await refresh();
      if (failed) setError(failed);
      return !failed;
    },
    [refresh],
  );

  /** Puts the viewer on a card or takes them off, showing it at once. */
  const toggleMe = useCallback(
    (card: BoardCard) => {
      const on = card.memberIds.includes(me);
      const memberIds = on ? card.memberIds.filter((id) => id !== me) : [...card.memberIds, me];
      setColumns((current) =>
        current
          ? {
              ...current,
              [card.status]: current[card.status].map((c) =>
                c.id === card.id ? { ...c, memberIds } : c,
              ),
            }
          : current,
      );
      const param = { id: String(card.id) };
      change(() =>
        on
          ? api.cards[":id"].members.me.$delete({ param })
          : api.cards[":id"].members.me.$put({ param }),
      );
    },
    [me, change],
  );

  const people = useMemo<People>(
    () => ({ me, canEdit, isAdmin, names, toggleMe, askDelete: setDeleting }),
    [me, canEdit, isAdmin, names, toggleMe],
  );

  const sensors = useSensors(
    // A short move starts a drag, so a click still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // On a phone, press and hold, so a swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space picks a card up and puts it down; Enter opens it.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  if (!columns) {
    return error ? (
      <Page title="Board">
        <ErrorBanner message={error} />
      </Page>
    ) : (
      <PageLoading />
    );
  }

  function onDragStart({ active }: DragStartEvent) {
    if (!columns) return;
    before.current = columns;
    setDragged(STATUSES.flatMap((s) => columns[s]).find((c) => c.id === active.id) ?? null);
  }

  // Into another column as it's dragged over it, so the card makes room there.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setColumns((current) => {
      if (!current) return current;
      const from = columnOf(current, active.id);
      const to = columnOf(current, over.id);
      if (!from || !to || from === to) return current;
      const card = current[from].find((c) => c.id === active.id);
      if (!card) return current;
      const target = current[to];
      const overIndex = target.findIndex((c) => c.id === over.id);
      const at = overIndex >= 0 ? overIndex : target.length;
      return {
        ...current,
        [from]: current[from].filter((c) => c.id !== active.id),
        [to]: [...target.slice(0, at), { ...card, status: to }, ...target.slice(at)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const start = before.current;
    before.current = null;
    setDragged(null);
    if (!columns || !start) return;
    const to = over ? columnOf(columns, over.id) : null;
    if (!over || !to) {
      setColumns(start);
      return;
    }
    const list = columns[to];
    const oldIndex = list.findIndex((c) => c.id === active.id);
    const overIndex = list.findIndex((c) => c.id === over.id);
    const sorted =
      oldIndex >= 0 && overIndex >= 0 && oldIndex !== overIndex
        ? arrayMove(list, oldIndex, overIndex)
        : list;
    const index = sorted.findIndex((c) => c.id === active.id);
    const was = STATUSES.find((s) => start[s].some((c) => c.id === active.id));
    const wasIndex = was ? start[was].findIndex((c) => c.id === active.id) : -1;
    setColumns({ ...columns, [to]: sorted });
    if (index < 0 || (was === to && wasIndex === index)) return;
    const id = String(active.id);
    change(() => api.cards[":id"].move.$put({ param: { id }, json: { status: to, index } }));
  }

  function onDragCancel() {
    if (before.current) setColumns(before.current);
    before.current = null;
    setDragged(null);
  }

  /** Deletes a card (admins only), closing it if it's open. */
  async function remove(card: BoardCard) {
    const ok = await change(() => api.cards[":id"].$delete({ param: { id: String(card.id) } }));
    if (ok && editingId === card.id) setEditingId(null);
    return ok;
  }

  // The card that's open, as it is now: everyone's changes show in its dialog too.
  const editing =
    editingId === null
      ? null
      : (STATUSES.flatMap((s) => columns[s]).find((c) => c.id === editingId) ?? null);

  return (
    <PeopleContext.Provider value={people}>
      <Page
        title="Board"
        description={
          canEdit
            ? "Add cards and drag them between columns. Everyone on the team sees the same board."
            : "Everyone on the team sees the same board. Sign in on your own device to change it."
        }
        width="wide"
      >
        {error && <ErrorBanner message={error} />}
        {canEdit && (
          <AddCard onAdd={(title) => change(() => api.cards.$post({ json: { title } }))} />
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                label={LABELS[status]}
                cards={columns[status]}
                canEdit={canEdit}
                onOpen={(card) => setEditingId(card.id)}
              />
            ))}
          </div>
          <DragOverlay>{dragged && <CardFace card={dragged} lifted />}</DragOverlay>
        </DndContext>
        {editing && (
          <CardDialog
            card={editing}
            canEdit={canEdit}
            onClose={() => setEditingId(null)}
            onRename={(title) =>
              change(() =>
                api.cards[":id"].$patch({ param: { id: String(editing.id) }, json: { title } }),
              )
            }
            onMove={(status) =>
              change(() =>
                api.cards[":id"].move.$put({
                  param: { id: String(editing.id) },
                  json: { status, index: columns[status].length },
                }),
              )
            }
            onDelete={() => remove(editing)}
          />
        )}
        {deleting && (
          <Dialog title="Delete card" onClose={() => setDeleting(null)}>
            <ConfirmQuestion
              question={`Delete "${deleting.title}" for everyone? This can't be undone.`}
              confirmLabel="Delete"
              keepLabel="Keep it"
              onConfirm={async () => {
                if (await remove(deleting)) setDeleting(null);
              }}
              onKeep={() => setDeleting(null)}
            />
          </Dialog>
        )}
      </Page>
    </PeopleContext.Provider>
  );
}
