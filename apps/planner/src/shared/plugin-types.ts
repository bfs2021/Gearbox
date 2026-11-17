// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from "react";

export interface PluginRoute {
  path: string;
  element: ReactElement;
}

/** Who a page is for: everyone signed in, or mentors and admins. */
export type Access = "everyone" | "mentor";

export interface PluginNavItem {
  label: string;
  to: string;
  order: number;
  /** Who sees it in the bar. Everyone when left out. */
  access?: Access;
}

export interface Plugin {
  name: string;
  routes: PluginRoute[];
  navItems?: PluginNavItem[];
}
