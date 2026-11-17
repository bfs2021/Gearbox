// SPDX-License-Identifier: AGPL-3.0-only
import { focusRing } from "@g3/ui";
import { Trash2 } from "lucide-react";
import { createContext, useContext } from "react";
import type { BoardCard } from "../../shared/api";

/** What every card on the board needs: who's looking, everyone's names, and joining a card. */
export type People = {
  me: string;
  canEdit: boolean;
  /** Only admins delete cards. */
  isAdmin: boolean;
  names: Map<string, string>;
  toggleMe: (card: BoardCard) => void;
  /** Asks whether to delete a card. */
  askDelete: (card: BoardCard) => void;
};

export const PeopleContext = createContext<People | null>(null);

export function usePeople(): People {
  const people = useContext(PeopleContext);
  if (!people) throw new Error("usePeople must be used inside the board");
  return people;
}

/** The names of who's on a card, the viewer's first. */
export function CardPeople({ card }: { card: BoardCard }) {
  const { me, names } = usePeople();
  const ids = [...card.memberIds].sort((a, b) => Number(b === me) - Number(a === me));
  if (!ids.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="On this card">
      {ids.map((id) => (
        <li
          key={id}
          className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs ${id === me ? "bg-primary-100 text-primary-800" : "bg-inset text-secondary-700"}`}
          title={names.get(id)}
        >
          {id === me ? "You" : (names.get(id) ?? "Former member")}
        </li>
      ))}
    </ul>
  );
}

/** Add me / Remove me: puts the viewer on a card or takes them off. Never starts a drag. */
export function ToggleMe({ card }: { card: BoardCard }) {
  const { me, canEdit, toggleMe } = usePeople();
  if (!canEdit) return null;
  const on = card.memberIds.includes(me);
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={stop}
      onKeyDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        toggleMe(card);
      }}
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-secondary-500 hover:bg-inset hover:text-secondary-900 ${focusRing}`}
    >
      {on ? "Remove me" : "Add me"}
    </button>
  );
}

/** An admin's trash button on a card: asks first. Never starts a drag or opens the card. */
function DeleteCard({ card }: { card: BoardCard }) {
  const { askDelete } = usePeople();
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-label="Delete card"
      title="Delete card"
      onPointerDown={stop}
      onKeyDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        askDelete(card);
      }}
      className={`rounded-md p-1 text-secondary-400 hover:bg-red-50 hover:text-red-700 ${focusRing}`}
    >
      <Trash2 aria-hidden className="size-3.5" />
    </button>
  );
}

/** A card's buttons: Add me (or Remove me), then for admins · and the trash. */
export function CardActions({ card }: { card: BoardCard }) {
  const { canEdit, isAdmin } = usePeople();
  if (!canEdit) return null;
  return (
    <div className="flex shrink-0 items-center">
      <ToggleMe card={card} />
      {isAdmin && (
        <>
          <span aria-hidden className="text-xs text-secondary-400">
            ·
          </span>
          <DeleteCard card={card} />
        </>
      )}
    </div>
  );
}
