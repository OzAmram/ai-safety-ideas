// Builds site/ideas.json from approved, open idea issues.
// Usage: node scripts/build-data.mjs [outPath]

import { writeFile } from "node:fs/promises";
import { parseIssueBody, cleanTitle, readStateComment, isStateComment } from "./lib.mjs";
import { LABELS, SITE_META } from "./schema.mjs";
import { REPO, ghAll, findStateComment } from "./github.mjs";

const outPath = process.argv[2] || "site/ideas.json";
const labelQuery = encodeURIComponent(`${LABELS.idea},${LABELS.approved}`);
const issues = (await ghAll(`/repos/${REPO}/issues?state=open&labels=${labelQuery}&sort=created&direction=desc`)).filter(
  (i) => !i.pull_request
);

const ideas = [];
for (const issue of issues) {
  const names = issue.labels.map((l) => l.name);
  const needsState = names.includes(LABELS.claimed) || names.includes(LABELS.done);
  const stateComment = needsState ? await findStateComment(issue.number, isStateComment) : null;
  const state = readStateComment(stateComment?.body);
  const f = parseIssueBody(issue.body);
  ideas.push({
    number: issue.number,
    title: cleanTitle(issue.title),
    url: issue.html_url,
    author: issue.user.login,
    avatar: issue.user.avatar_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    ...f,
    claims: state.claims.map(({ user, mode, since, renewedAt, note }) => ({ user, mode, since, renewedAt, note })),
    results: state.results,
  });
}

const [owner, name] = REPO.split("/");
await writeFile(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), repo: REPO, siteTitle: process.env.SITE_TITLE || "", owner, name, meta: SITE_META, ideas }, null, 1)
);
console.log(`Wrote ${ideas.length} ideas to ${outPath}`);
