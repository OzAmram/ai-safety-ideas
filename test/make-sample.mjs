// Writes site/sample-ideas.json (same shape as build-data.mjs output) from test/sample-issues.mjs.
// Usage: node test/make-sample.mjs

import { writeFile } from "node:fs/promises";
import { parseIssueBody } from "../scripts/lib.mjs";
import { SITE_META } from "../scripts/schema.mjs";
import { sampleIssues } from "./sample-issues.mjs";

const iso = (d) => new Date(`${d}T15:00:00Z`).toISOString();
const ideas = sampleIssues().map((s) => ({
  number: s.number,
  title: s.title,
  url: `https://github.com/OWNER/REPO/issues/${s.number}`,
  author: s.author,
  avatar: "",
  createdAt: iso(s.created),
  updatedAt: iso(s.claims.at(-1)?.renewedAt ?? s.created),
  ...parseIssueBody(s.body),
  claims: s.claims.map((c) => ({ ...c, since: iso(c.since), renewedAt: iso(c.renewedAt) })),
  results: (s.results ?? []).map((r) => ({ ...r, at: iso(r.at) })),
}));

const out = { generatedAt: new Date().toISOString(), repo: "OWNER/REPO", siteTitle: "", owner: "OWNER", name: "REPO", meta: SITE_META, ideas };
await writeFile(new URL("../site/sample-ideas.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`Wrote ${ideas.length} sample ideas`);
