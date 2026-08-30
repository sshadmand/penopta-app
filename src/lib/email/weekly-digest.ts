import { getPublicAppUrl } from "@/lib/integrations/providers";

import { isEmailConfigured, sendEmail } from "./emailer";
import { escapeHtml, summaryMarkdownToEmailHtml } from "./html";

export type DigestProjectSection = {
  projectId: string;
  projectName: string;
  visibility: "public" | "private";
  ownerUserId: string;
  text: string;
  /** Timestamps for the daily summaries included in this week's rollup. */
  dailySummaryDates?: string[];
};

export type WeeklyDigestActivityDay = {
  day: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

const EMAIL_CONTRIBUTION_COLORS = [
  "#ebedf0",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;

function utcDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function previousUtcDays(endDay: string, count: number): string[] {
  const end = new Date(`${endDay}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

/** Seven-day, GitHub-style activity strip based on included daily summaries. */
export function weeklyDigestActivity(
  sections: DigestProjectSection[],
  endDay = new Date().toISOString().slice(0, 10),
): WeeklyDigestActivityDay[] {
  const counts = new Map<string, number>();
  for (const section of sections) {
    for (const timestamp of section.dailySummaryDates ?? []) {
      const day = utcDay(timestamp);
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  const days = previousUtcDays(endDay, 7);
  const peak = Math.max(...days.map((day) => counts.get(day) ?? 0), 0);
  return days.map((day) => {
    const count = counts.get(day) ?? 0;
    const level =
      count === 0 || peak === 0
        ? 0
        : Math.min(4, Math.max(1, Math.ceil((count / peak) * 4))) as
            | 1
            | 2
            | 3
            | 4;
    return { day, count, level };
  });
}

function weekdayLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function shortDateLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function weeklyActivityEmailHtml(activity: WeeklyDigestActivityDay[]): string {
  const cells = activity
    .map(
      ({ day, count, level }) => `
        <td align="center" style="width:14.285%;padding:0 3px;vertical-align:top;">
          <div style="margin-bottom:6px;color:#71717a;font-size:11px;line-height:14px;">${weekdayLabel(day)}</div>
          <div title="${count} daily ${count === 1 ? "summary" : "summaries"} on ${shortDateLabel(day)}" style="height:32px;border-radius:4px;background:${EMAIL_CONTRIBUTION_COLORS[level]};font-size:0;line-height:0;">&nbsp;</div>
          <div style="margin-top:6px;color:#71717a;font-size:10px;line-height:12px;">${shortDateLabel(day)}</div>
        </td>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 4px;border:1px solid #e4e4e7;border-radius:12px;background:#ffffff;">
      <tr><td style="padding:16px 14px 14px;">
        <div style="margin-bottom:12px;color:#18181b;font-size:13px;font-weight:600;">Week at a glance</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cells}</tr></table>
      </td></tr>
    </table>`;
}

export function digestSectionsForRecipient(
  sections: DigestProjectSection[],
  recipientUserId: string,
): { shared: DigestProjectSection[]; privateOwn: DigestProjectSection[] } {
  const visible = sections.filter(
    (section) =>
      section.visibility === "public" ||
      section.ownerUserId === recipientUserId,
  );
  return {
    shared: visible.filter((section) => section.visibility === "public"),
    privateOwn: visible.filter((section) => section.visibility === "private"),
  };
}

/** True when there is at least one non-empty summary to put in the email. */
export function weeklyDigestHasContent(
  shared: DigestProjectSection[],
  privateOwn: DigestProjectSection[],
): boolean {
  return [...shared, ...privateOwn].some(
    (section) => section.text.trim().length > 0,
  );
}

export function buildWeeklyDigestEmail(opts: {
  orgName: string;
  recipientName: string | null;
  shared: DigestProjectSection[];
  privateOwn: DigestProjectSection[];
  /** UTC day ending the displayed seven-day window. Defaults to today. */
  activityEndDay?: string;
}): { subject: string; text: string; html: string } {
  const appUrl = getPublicAppUrl();
  const greeting = opts.recipientName?.split(/\s+/)[0] || "there";
  const subject = `${opts.orgName}: this week’s progress`;
  const activity = weeklyDigestActivity(
    [...opts.shared, ...opts.privateOwn],
    opts.activityEndDay,
  );

  const textBlocks: string[] = [
    `Hi ${greeting},`,
    "",
    `Here’s a recap of last week’s daily summaries for ${opts.orgName} on Penopta.`,
    "",
    `Week at a glance: ${activity.map((day) => `${weekdayLabel(day.day)} ${day.count}`).join(" · ")}`,
  ];

  const htmlSections: string[] = [];

  function appendSection(section: DigestProjectSection, heading: string) {
    const href = `${appUrl}/projects/${section.projectId}`;
    textBlocks.push("", heading, section.text, `Open: ${href}`);
    htmlSections.push(`
      <h2 style="margin:1.4em 0 0.4em;font-size:18px;">
        <a href="${escapeHtml(href)}" style="color:#111;text-decoration:none;">
          ${escapeHtml(section.projectName)}
        </a>
      </h2>
      ${summaryMarkdownToEmailHtml(section.text)}
      <p style="margin:0.4em 0 0;">
        <a href="${escapeHtml(href)}">Open ${escapeHtml(section.projectName)}</a>
      </p>
    `);
  }

  if (opts.shared.length > 0) {
    textBlocks.push("", "Shared workgroups");
    htmlSections.push(
      `<h2 style="margin:1.6em 0 0.2em;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#666;">Shared workgroups</h2>`,
    );
    for (const section of opts.shared) {
      appendSection(section, section.projectName);
    }
  }

  if (opts.privateOwn.length > 0) {
    textBlocks.push("", "Your private workgroups");
    htmlSections.push(
      `<h2 style="margin:1.6em 0 0.2em;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#666;">Your private workgroups</h2>`,
    );
    for (const section of opts.privateOwn) {
      appendSection(section, section.projectName);
    }
  }

  textBlocks.push(
    "",
    `Open Penopta: ${appUrl}`,
    "",
    "Owners can turn this weekly email on or off under Integrations → AI models.",
  );

  const html = `
    <html>
      <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 640px;">
        <p>Hi ${escapeHtml(greeting)},</p>
        <p>Here’s a recap of last week’s daily summaries for <strong>${escapeHtml(opts.orgName)}</strong> on Penopta.</p>
        ${weeklyActivityEmailHtml(activity)}
        ${htmlSections.join("\n")}
        <p style="margin-top:2em;"><a href="${escapeHtml(appUrl)}">Open Penopta</a></p>
        <p style="color:#666;font-size:13px;">
          Owners can turn this weekly email on or off under Integrations → AI models.
        </p>
      </body>
    </html>
  `.trim();

  return { subject, text: textBlocks.join("\n"), html };
}

export async function sendWeeklyDigestEmail(opts: {
  to: string;
  orgName: string;
  recipientName: string | null;
  shared: DigestProjectSection[];
  privateOwn: DigestProjectSection[];
  activityEndDay?: string;
}): Promise<{ sent: boolean; skipped?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: "Email is not configured." };
  }
  if (!weeklyDigestHasContent(opts.shared, opts.privateOwn)) {
    return { sent: false, skipped: "No summaries this week." };
  }

  const { subject, text, html } = buildWeeklyDigestEmail(opts);
  await sendEmail({ to: opts.to, subject, text, html });
  return { sent: true };
}
