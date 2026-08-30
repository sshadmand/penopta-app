import { lookupUsers } from "@/lib/auth/users";
import type { Session } from "@/lib/auth/session";
import type { AgentThreadRow } from "@/lib/db/schema";

/**
 * Resolve owner user ids on threads to display names.
 * Seeds the current user from the session, then fills the rest from the local
 * user directory. Ids that can't be resolved are simply omitted (callers fall back).
 */
export async function resolveThreadOwnerNames(
  threads: Pick<AgentThreadRow, "ownerUserId">[],
  session: Session,
): Promise<Record<string, string>> {
  const names: Record<string, string> = {
    [session.user.id]: session.user.name || session.user.email,
  };

  const directory = await lookupUsers(threads.map((t) => t.ownerUserId));
  for (const [id, directoryUser] of directory) {
    if (directoryUser.name) names[id] = directoryUser.name;
  }

  return names;
}
