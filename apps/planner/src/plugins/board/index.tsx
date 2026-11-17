// SPDX-License-Identifier: AGPL-3.0-only
import type { Plugin } from "../../shared/plugin-types";
import { BoardPage } from "./board-page";

export const boardPlugin: Plugin = {
  name: "board",
  routes: [{ path: "/", element: <BoardPage /> }],
  navItems: [{ label: "Board", to: "/", order: 10 }],
};
