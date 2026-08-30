import { getPublicAppUrl } from "@/lib/integrations/providers";

import { isEmailConfigured, sendEmail } from "./emailer";

/** Notify a newly added member that they were invited to an org. */
export async function sendOrgInviteEmail({
  to,
  orgName,
  role,
  invitedByName,
}: {
  to: string;
  orgName: string;
  role: "owner" | "member";
  invitedByName: string;
}): Promise<{ sent: boolean; skipped?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: "Email is not configured." };
  }

  const appUrl = getPublicAppUrl();
  const roleLabel = role === "owner" ? "an owner" : "a member";
  const subject = `You've been added to ${orgName} on Penopta`;
  const text = [
    `${invitedByName} added you as ${roleLabel} of ${orgName} on Penopta.`,
    "",
    `Open Penopta: ${appUrl}`,
    "",
    "Sign in with the same Penopta account this invite was sent to.",
  ].join("\n");

  const html = `
    <html>
      <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
        <p><strong>${escapeHtml(invitedByName)}</strong> added you as ${roleLabel} of
          <strong>${escapeHtml(orgName)}</strong> on Penopta.</p>
        <p><a href="${escapeHtml(appUrl)}">Open Penopta</a></p>
        <p style="color: #666; font-size: 13px;">
          Sign in with the same Penopta account this invite was sent to.
        </p>
      </body>
    </html>
  `.trim();

  await sendEmail({ to, subject, text, html });
  return { sent: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
