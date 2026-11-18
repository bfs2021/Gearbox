# Planner

A board of cards the team shares, in three columns: Not Started, In Progress and Done.

Built like the other apps: React, React Router and Tailwind v4 with the shared top bar, colors,
fonts and light/dark mode from `@g3/ui`, plugins under `src/plugins/`, and a typed Hono client
for [`workers/planner`](../../workers/planner).

## Pages

- **Board** (`/`, `src/plugins/board/`): Not Started, the team's own middle columns and Done
  (`column.tsx`; side by side from tablet width up, scrolling sideways when there are many,
  stacked on a phone), each with its cards in order. With no middle columns, "Add columns in the Admin
  panel" stands where they'd be (`no-columns.tsx`),
  under a box for adding a card (`add-card.tsx`), which goes to the bottom of Not Started, where
  every card starts. Cards are dragged with `@dnd-kit` (a 5 px move with a mouse,
  press and hold on a phone, Space with a keyboard), and a click or Enter opens a card's dialog
  (`card-dialog.tsx`: rename, move to another column, and for admins delete). Admins also get a trash button beside Add me on each card, which asks first. Each card names who's on it ("You" first) with an **Add me** / **Remove me** button (`people.tsx`), shown at once and saved after; mentors, admins and trusted students (`/me`'s `canAssign`) also put anyone on a card or take them off in its dialog (`AssignPeople`); names come from `GET /cards/people`, asked again (at most once a minute) when someone new is on a card. The page asks for the cards every
  5 seconds while it's showing, and after each change, but not during a drag or while a change is
  on its way. Kiosks see the board without the controls.
- **Send meeting overview** (mentors and admins, `send-overview.tsx`, in the page's actions):
  posts the board to the team's chat and says when the last one went.
- **Admin** (`/admin`, mentors and admins, `src/plugins/admin/`): the board's columns between
  Not Started and Done, in order, to add, move, rename and delete (`columns-card.tsx`); trusted students (`trusted-card.tsx`); the
  channel for meeting overviews (`ChannelPicker` from `@g3/ui`), and how members add cards with `/gb-add`.
