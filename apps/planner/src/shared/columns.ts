// SPDX-License-Identifier: AGPL-3.0-only
import type { Column } from "@g3/worker-planner";

// The board's columns: Not Started and Done always, the team's own in between. The API names one
// by "not_started", "done" or a middle column's id; drag and drop by a string (`laneId`), so a
// column's id never clashes with a card's.

export type { Column };

/** One of the team's middle columns. */
export type MiddleColumn = { id: number; name: string };

/** A column's id for drag and drop. */
export const laneId = (column: Column): string =>
  typeof column === "number" ? `column-${column}` : column;

/** The column a drag and drop id names, or null for one that isn't a column. */
export function columnOfLane(lane: string): Column | null {
  if (lane === "not_started" || lane === "done") return lane;
  const id = Number(lane.replace(/^column-/, ""));
  return lane.startsWith("column-") && Number.isInteger(id) ? id : null;
}

/** Every column, left to right. */
export const allColumns = (middle: MiddleColumn[]): Column[] => [
  "not_started",
  ...middle.map((column) => column.id),
  "done",
];

/** What a column is called. */
export function columnName(column: Column, middle: MiddleColumn[]): string {
  if (column === "not_started") return "Not Started";
  if (column === "done") return "Done";
  return middle.find((c) => c.id === column)?.name ?? "Column";
}
