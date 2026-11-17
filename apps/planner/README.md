# Planner

A board of cards the team shares, in three columns: Not Started, In Progress and Done.

Built like the other apps: React, React Router and Tailwind v4 with the shared top bar, colors,
fonts and light/dark mode from `@g3/ui`, plugins under `src/plugins/`, and a typed Hono client
for [`workers/planner`](../../workers/planner).

## Pages

- **Board** (`/`, `src/plugins/board/`): the columns (`column.tsx`), each with its cards in order,
  under a box for adding a card (`add-card.tsx`), which goes to the bottom of Not Started, where
  every card starts. Cards are dragged with `@dnd-kit` (a 5 px move with a mouse,
  press and hold on a phone, Space with a keyboard), and a click or Enter opens a card's dialog
  (`card-dialog.tsx`: rename, move to another column, and for admins delete). Admins also get a trash button beside Add me on each card, which asks first. Each card names who's on it ("You" first) with an **Add me** / **Remove me** button (`people.tsx`), shown at once and saved after; names come from `GET /cards/people`, asked again (at most once a minute) when someone new is on a card. The page asks for the cards every
  5 seconds while it's showing, and after each change, but not during a drag or while a change is
  on its way. Kiosks see the board without the controls.
- **Send meeting overview** (mentors and admins, `send-overview.tsx`, in the page's actions):
  posts the board to the team's chat and says when the last one went.
- **Admin** (`/admin`, mentors and admins, `src/plugins/admin/`): the channel for meeting
  overviews (`ChannelPicker` from `@g3/ui`), and how members add cards with `/gb-add`.
