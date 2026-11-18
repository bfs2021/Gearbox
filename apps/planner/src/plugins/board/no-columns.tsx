// SPDX-License-Identifier: AGPL-3.0-only
import { focusRing } from "@g3/ui";
import { Link } from "react-router-dom";
import { useAuthUser } from "../../shared/auth";
import { COLUMN_WIDTH } from "./column";

/**
 * Where the middle columns go, while the team has none: a column-shaped space between Not Started
 * and Done. Mentors and admins (who can open Admin) get a link there.
 */
export function NoMiddleColumns() {
  const { isMentor } = useAuthUser();
  const admin = isMentor ? (
    <Link
      to="/admin"
      className={`rounded font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800 ${focusRing}`}
    >
      Admin panel
    </Link>
  ) : (
    <span className="font-medium text-secondary-700">Admin panel</span>
  );
  return (
    <div
      className={`flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line p-4 text-center text-sm text-secondary-500 ${COLUMN_WIDTH}`}
    >
      <p>Add columns in the {admin}</p>
    </div>
  );
}
