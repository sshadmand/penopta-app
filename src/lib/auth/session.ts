/** App-facing session user (Better Auth). */
export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

/** What server components / actions use after auth. */
export interface Session {
  user: SessionUser;
}
