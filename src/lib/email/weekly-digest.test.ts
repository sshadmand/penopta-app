import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyDigestEmail,
  digestSectionsForRecipient,
  weeklyDigestHasContent,
  type DigestProjectSection,
} from "./weekly-digest";

const shared: DigestProjectSection = {
  projectId: "pub-1",
  projectName: "Website",
  visibility: "public",
  ownerUserId: "alex",
  text: "- Shipped **pricing** page",
  dailySummaryDates: ["2026-08-17T14:00:00.000Z", "2026-08-19T14:00:00.000Z"],
};

const privateAlex: DigestProjectSection = {
  projectId: "priv-1",
  projectName: "Secret",
  visibility: "private",
  ownerUserId: "alex",
  text: "- Drafted launch notes",
  dailySummaryDates: ["2026-08-19T14:00:00.000Z"],
};

test("digestSectionsForRecipient keeps private projects off other members", () => {
  const alex = digestSectionsForRecipient([shared, privateAlex], "alex");
  assert.equal(alex.shared.length, 1);
  assert.equal(alex.privateOwn.length, 1);

  const sam = digestSectionsForRecipient([shared, privateAlex], "sam");
  assert.equal(sam.shared.length, 1);
  assert.equal(sam.privateOwn.length, 0);
});

test("weeklyDigestHasContent is false when there are no summaries", () => {
  assert.equal(weeklyDigestHasContent([], []), false);
  assert.equal(
    weeklyDigestHasContent(
      [{ ...shared, text: "   " }],
      [{ ...privateAlex, text: "" }],
    ),
    false,
  );
  assert.equal(weeklyDigestHasContent([shared], []), true);
});

test("buildWeeklyDigestEmail omits the private section when empty", () => {
  const samMail = buildWeeklyDigestEmail({
    orgName: "Acme",
    recipientName: "Sam Lee",
    shared: [shared],
    privateOwn: [],
    activityEndDay: "2026-08-23",
  });
  assert.match(samMail.subject, /Acme/);
  assert.match(samMail.text, /Website/);
  assert.doesNotMatch(samMail.text, /Secret/);
  assert.doesNotMatch(samMail.html, /Your private workgroups/);
  assert.match(samMail.html, /Week at a glance/);
  assert.match(samMail.html, /#216e39/);

  const alexMail = buildWeeklyDigestEmail({
    orgName: "Acme",
    recipientName: "Alex",
    shared: [shared],
    privateOwn: [privateAlex],
    activityEndDay: "2026-08-23",
  });
  assert.match(alexMail.text, /Secret/);
  assert.match(alexMail.html, /Your private workgroups/);
});
