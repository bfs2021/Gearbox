// SPDX-License-Identifier: AGPL-3.0-only

// Planner's limits, shared with its page (`@g3/worker-planner/limits`). Kept apart from
// `src/index.ts`, whose exports a Worker only allows to be handlers.

/** The longest column name. */
export const MAX_COLUMN_NAME = 40;
/** The most middle columns a team can have. */
export const MAX_COLUMNS = 20;
