import { EmailClient } from "@azure/communication-email";

/**
 * Send a transactional email via Azure Communication Services.
 * Configure via AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING and EMAIL_FROM.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const connectionString =
    process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING?.trim();
  if (!connectionString) {
    throw new Error("Missing AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING");
  }

  const senderAddress = (
    process.env.AZURE_COMMUNICATION_EMAIL_SENDER_ADDRESS?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "DoNotReply@node-mailer.com"
  );
  if (!senderAddress) {
    throw new Error("Missing AZURE_COMMUNICATION_EMAIL_SENDER_ADDRESS");
  }

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress,
    content: {
      subject,
      plainText: text,
      html:
        html ??
        `<html><body>${text.replace(/\n/g, "<br />")}</body></html>`,
    },
    recipients: {
      to: [{ address: to }],
    },
  });

  return poller.pollUntilDone();
}

/** True when ACS email is configured for this environment. */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING?.trim(),
  );
}
