// SPDX-License-Identifier: AGPL-3.0-only
import { redirectToSignIn } from "@g3/ui";
import type { PlannerApp } from "@g3/worker-planner";
import { hc } from "hono/client";

export const api = hc<PlannerApp>(import.meta.env.VITE_API_BASE_URL ?? "", {
  init: { credentials: "include" },
});

/** Off to the team's ID sign-in page, coming back here (the same for every app). */
export function redirectToLogin(): void {
  redirectToSignIn();
}
