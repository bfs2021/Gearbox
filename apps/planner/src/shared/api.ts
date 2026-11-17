// SPDX-License-Identifier: AGPL-3.0-only
import { redirectToSignIn } from "@g3/ui";
import type { PlannerApp } from "@g3/worker-planner";
import { type InferResponseType, hc } from "hono/client";

export const api = hc<PlannerApp>(import.meta.env.VITE_API_BASE_URL ?? "", {
  init: { credentials: "include" },
});

/** Off to the team's ID sign-in page, coming back here (the same for every app). */
export function redirectToLogin(): void {
  redirectToSignIn();
}

/** What to show for a call that didn't work. A signed-out member goes to sign in. */
export async function getErrorMessage(res: {
  status: number;
  json(): Promise<unknown>;
}): Promise<string> {
  if (res.status === 401) {
    redirectToLogin();
    return "Redirecting to sign in…";
  }
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `Request failed (${res.status}).`;
}

export type BoardCard = InferResponseType<(typeof api.cards)["$get"], 200>[number];
export type Person = InferResponseType<(typeof api.cards.people)["$get"], 200>[number];
