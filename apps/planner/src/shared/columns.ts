// SPDX-License-Identifier: AGPL-3.0-only
import type { Status } from "@g3/worker-planner";

/** The board's columns, left to right. */
export const STATUSES: Status[] = ["not_started", "in_progress", "done"];

export const LABELS: Record<Status, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  done: "Done",
};
