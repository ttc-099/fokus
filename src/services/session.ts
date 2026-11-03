// src/services/session.ts
// signing out has to end on a signed-out screen no matter what the network says.
// the old inline handler awaited the request first, so an expired session (401)
// or being offline threw and the button did nothing at all.

import { api, type User } from "./api";
import { cachedUser } from "./offline";

export async function signOut(setUser: (u: User | null) => void) {
  try {
    await api.logout();
  } catch {
    // the session may already be gone, or the device may be offline;
    // either way the local identity must go
  }
  cachedUser.clear();
  setUser(null);
}
