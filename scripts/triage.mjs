// Runs when an idea issue is opened, edited or labeled.
//
// Every run reads the issue fresh from the API and brings it to the right
// state, whatever event triggered it. GitHub fires several events at once
// when an issue is created with labels, and its concurrency rules cancel all
// but the latest queued run, so no single event can be relied on to arrive.
//
// - Syncs area/size/mentorship/exclusive labels from the form fields.
// - Auto-approves trusted posters; queues everyone else for review (once).
// - Once approved, makes sure the claims comment and status label exist.

import { readFile } from "node:fs/promises";
import { parseIssueBody, fieldLabels, isFieldLabel, readStateComment, renderStateComment, isStateComment, statusLabels } from "./lib.mjs";
import { LABELS } from "./schema.mjs";
import { REPO, gh, ghAll, readEvent, findStateComment, upsertStateComment, comment, addLabels, removeLabel } from "./github.mjs";

// Triggered by an issue event: handle that issue. Run manually: re-check every open idea.
const event = await readEvent();
const numbers = event.issue
  ? [event.issue.number]
  : (await ghAll(`/repos/${REPO}/issues?state=open&labels=${LABELS.idea}`)).filter((i) => !i.pull_request).map((i) => i.number);
for (const n of numbers) await triage(n);
if (!event.issue) console.log(`Re-checked ${numbers.length} open ideas.`);

async function triage(number) {
  const issue = await gh("GET", `/repos/${REPO}/issues/${number}`);
  let labels = issue.labels.map((l) => l.name);
  if (!labels.includes(LABELS.idea) || issue.state !== "open") return;

  // 1. Field labels follow the form fields in the issue body.
  const wanted = fieldLabels(parseIssueBody(issue.body));
  for (const l of labels.filter((l) => isFieldLabel(l) && !wanted.includes(l))) await removeLabel(issue.number, l);
  await addLabels(issue.number, wanted.filter((l) => !labels.includes(l)));

  // 2. Approval: decide once, for issues that have neither label yet.
  if (!labels.includes(LABELS.approved) && !labels.includes(LABELS.needsReview)) {
    const author = issue.user.login.toLowerCase();
    const trusted = (await readFile(".github/trusted-posters.txt", "utf8").catch(() => ""))
      .split(/\r?\n/)
      .map((s) => s.replace(/#.*/, "").trim().toLowerCase())
      .filter(Boolean);
    const isMaintainer = ["OWNER", "MEMBER", "COLLABORATOR"].includes(issue.author_association);

    if (isMaintainer || trusted.includes(author)) {
      await addLabels(issue.number, [LABELS.approved]);
      labels.push(LABELS.approved);
    } else {
      await addLabels(issue.number, [LABELS.needsReview]);
      await comment(issue.number, `Thanks @${issue.user.login}! A maintainer will review this idea shortly; it will appear on the site once approved.`);
      return;
    }
  }

  // 3. Approved ideas get the claims comment and a status label.
  if (labels.includes(LABELS.approved)) {
    if (labels.includes(LABELS.needsReview)) await removeLabel(issue.number, LABELS.needsReview);
    const existing = await findStateComment(issue.number, isStateComment);
    const state = readStateComment(existing?.body);
    if (!existing) await upsertStateComment(issue.number, null, renderStateComment(state));
    const { add, remove } = statusLabels(state);
    await addLabels(issue.number, add.filter((l) => !labels.includes(l)));
    for (const l of remove.filter((l) => labels.includes(l))) await removeLabel(issue.number, l);
  }
}
