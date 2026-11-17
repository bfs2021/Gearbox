// SPDX-License-Identifier: AGPL-3.0-only
import { defineManifest } from "@g3/auth";
import packageJson from "../package.json";

// What this app tells the platform about itself (roadmap 4.1; the type is in @g3/auth).
export const manifest = defineManifest({
  slug: "planner",
  name: "Planner",
  summary: "Plan your team's work.",
  roles: ["admin", "mentor", "member"],
  integrations: [],
  availability: "every team",
  preview: "Planner is new and has no features yet.",
  version: packageJson.version,
  hooks: { seed: false, delete: true, move: true, export: true, demo: true, storage: false },
  settings: [],
  plugins: [],
});
