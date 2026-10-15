// Runs when an idea issue is opened, edited or labeled.
// - Syncs area/size/mentorship/exclusive labels from the form fields.
// - Auto-approves trusted posters; queues everyone else for review.

import { readFile } from "node:fs/promises";
import { parseIssueBody, fieldLabels, isFieldLabel, readStateComment, renderStateComment, isStateComment } from "./lib.mjs";
import { LABELS } from "./schema.mjs";
import { readEvent, findStateComment, upsertStateComment, comment, addLabels, removeLabel } from "./github.mjs";

const event = await readEvent();
const issue = event.issue;
const labels = issue.labels.map((l) => l.name);
if (!labels.includes(LABELS.idea)) process.exit(0);

// A maintainer approved the idea by adding the "approved" label.
if (event.action === "labeled") {
  if (event.label?.name === LABELS.approved && labels.includes(LABELS.needsReview)) {
    await removeLabel(issue.number, LABELS.needsReview);
    await setupClaims();
  }
  process.exit(0);
}

// Sync field labels with the body (also after edits).
const wanted = fieldLabels(parseIssueBody(issue.body));
for (const l of labels.filter((l) => isFieldLabel(l) && !wanted.includes(l))) await removeLabel(issue.number, l);
await addLabels(issue.number, wanted.filter((l) => !labels.includes(l)));

if (event.action === "opened") {
  const author = issue.user.login.toLowerCase();
  const trusted = (await readFile(".github/trusted-posters.txt", "utf8").catch(() => ""))
    .split(/\r?\n/)
    .map((s) => s.replace(/#.*/, "").trim().toLowerCase())
    .filter(Boolean);
  const isMaintainer = ["OWNER", "MEMBER", "COLLABORATOR"].includes(issue.author_association);

  if (isMaintainer || trusted.includes(author)) {
    await addLabels(issue.number, [LABELS.approved]);
    await setupClaims();
  } else {
    await addLabels(issue.number, [LABELS.needsReview]);
    await comment(issue.number, `Thanks @${issue.user.login}! A maintainer will review this idea shortly; it will appear on the site once approved.`);
  }
}

async function setupClaims() {
  const existing = await findStateComment(issue.number, isStateComment);
  if (!existing) await upsertStateComment(issue.number, null, renderStateComment(readStateComment("")));
  await addLabels(issue.number, [LABELS.available]);
}
