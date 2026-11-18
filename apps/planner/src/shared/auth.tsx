// SPDX-License-Identifier: AGPL-3.0-only
import { PageLoading } from "@g3/ui";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { api, redirectToLogin } from "./api";

export type AuthUser = {
  userId: string;
  displayName: string;
  /** G3ID mentors and admins. */
  isMentor: boolean;
  /** G3ID admins. */
  isAdmin: boolean;
  /** Everyone but a kiosk changes the board. */
  canEdit: boolean;
  /** Mentors, admins and trusted students put anyone on a card or take them off. */
  canAssign: boolean;
};

const AuthUserContext = createContext<AuthUser | null>(null);

/** The signed-in user. Only valid inside ProtectedRoute. */
export function useAuthUser(): AuthUser {
  const user = useContext(AuthUserContext);
  if (!user) throw new Error("useAuthUser must be used inside ProtectedRoute");
  return user;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | "loading">("loading");

  useEffect(() => {
    api.me
      .$get()
      .then(async (res) => setUser(res.ok ? await res.json() : null))
      .catch(() => setUser(null));
  }, []);

  if (user === "loading") return <PageLoading />;
  if (!user) {
    redirectToLogin();
    return null;
  }
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}
