// Runs on every new issue comment. Handles /claim, /renew, /release, /done.

import { parseCommand, parseIssueBody, applyCommand, readStateComment, renderStateComment, isStateComment, statusLabels } from "./lib.mjs";
import { LABELS } from "./schema.mjs";
import { readEvent, findStateComment, upsertStateComment, comment, addLabels, removeLabel, setAssignees } from "./github.mjs";

const event = await readEvent();
const issue = event.issue;
const actor = event.comment.user.login;

const cmd = parseCommand(event.comment.body);
const labels = issue.labels.map((l) => l.name);

if (!cmd || !labels.includes(LABELS.idea) || event.comment.user.type === "Bot") process.exit(0);

if (!labels.includes(LABELS.approved)) {
  await comment(issue.number, `@${actor} this idea hasn't been approved by a maintainer yet, so it can't be claimed.`);
  process.exit(0);
}
if (issue.state !== "open") {
  await comment(issue.number, `@${actor} this idea is closed. Ask a maintainer to reopen it if you'd like to work on it.`);
  process.exit(0);
}

const fields = parseIssueBody(issue.body);
const existing = await findStateComment(issue.number, isStateComment);
const prev = readStateComment(existing?.body);

const result = applyCommand(prev, cmd, {
  actor,
  now: new Date(),
  claimMode: fields.claimMode,
  ideaAuthor: issue.user.login,
  isMaintainer: ["OWNER", "MEMBER", "COLLABORATOR"].includes(event.comment.author_association),
});

if (result.ok) {
  await upsertStateComment(issue.number, existing, renderStateComment(result.state));
  await setAssignees(issue.number, result.assign, result.unassign);
  const { add, remove } = statusLabels(result.state);
  await addLabels(issue.number, add);
  for (const l of remove) await removeLabel(issue.number, l);
}
if (result.reply) await comment(issue.number, result.reply);
