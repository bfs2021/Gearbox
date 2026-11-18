// SPDX-License-Identifier: AGPL-3.0-only
import { defineManifest } from "@g3/auth";
import packageJson from "../package.json";

// What this app tells the platform about itself (roadmap 4.1; the type is in @g3/auth).
export const manifest = defineManifest({
  slug: "planner",
  name: "Planner",
  summary: "A board of cards for your team's work: Not Started, In Progress, Done.",
  roles: ["admin", "mentor", "member"],
  integrations: ["slack or discord"],
  availability: "every team",
  preview: "Planner is new: so far it has only its board.",
  version: packageJson.version,
  hooks: { seed: true, delete: true, move: true, export: true, demo: true, storage: false },
  settings: [
    {
      key: "overviewChannel",
      label: "Channel for meeting overviews",
      type: "text",
      default: null,
      editedBy: "mentor",
      page: "/admin",
    },
  ],
  plugins: [],
});
