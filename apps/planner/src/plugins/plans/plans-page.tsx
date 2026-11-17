// SPDX-License-Identifier: AGPL-3.0-only
import { Card, Page } from "@g3/ui";

/** The app's home. Empty for now: Planner's features come later. */
export function PlansPage() {
  return (
    <Page title="Plans">
      <Card>
        <p className="text-sm text-secondary-500">Nothing to plan yet. Planner is coming soon.</p>
      </Card>
    </Page>
  );
}
