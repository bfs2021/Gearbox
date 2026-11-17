// SPDX-License-Identifier: AGPL-3.0-only
import type { Plugin } from "../../shared/plugin-types";
import { PlansPage } from "./plans-page";

export const plansPlugin: Plugin = {
  name: "plans",
  routes: [{ path: "/", element: <PlansPage /> }],
  navItems: [{ label: "Plans", to: "/", order: 10 }],
};
