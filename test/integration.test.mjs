// Runs the real Actions scripts against an in-memory fake of the GitHub API.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname;
const REPO = "oz/safety-ideas";
const BOT = { login: "github-actions[bot]", type: "Bot" };

// ------------------------------------------------------------------ fake API
const db = { issues: new Map(), nextComment: 1 };
function newIssue(number, user, body, labels, association = "NONE") {
  db.issues.set(number, {
    number, title: `[Idea] Idea ${number}`, body, state: "open", user: { login: user, avatar_url: "" },
    author_association: association, labels: labels.map((name) => ({ name })), assignees: [], comments: [],
    html_url: `https://github.com/${REPO}/issues/${number}`, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  });
}
const view = (i) => ({ ...i, comments: i.comments.length });

let server, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(`/repos/${REPO}`, "");
    const send = (code, data) => { res.writeHead(code, { "content-type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
    let m;
    if (req.method === "GET" && p === "/issues") {
      const want = (url.searchParams.get("labels") || "").split(",").filter(Boolean);
      const page = Number(url.searchParams.get("page") || 1);
      const list = [...db.issues.values()].filter((i) => i.state === "open" && want.every((w) => i.labels.some((l) => l.name === w)));
      return send(200, page === 1 ? list.map(view) : []);
    }
    if (req.method === "GET" && (m = p.match(/^\/issues\/(\d+)$/))) {
      const i = db.issues.get(Number(m[1]));
      return i ? send(200, view(i)) : send(404, {});
    }
    if ((m = p.match(/^\/issues\/(\d+)\/comments$/))) {
      const i = db.issues.get(Number(m[1]));
      if (req.method === "GET") return send(200, Number(url.searchParams.get("page") || 1) === 1 ? i.comments : []);
      const c = { id: db.nextComment++, user: BOT, body: body.body };
      i.comments.push(c);
      return send(201, c);
    }
    if (req.method === "PATCH" && (m = p.match(/^\/issues\/comments\/(\d+)$/))) {
      for (const i of db.issues.values()) for (const c of i.comments) if (c.id === Number(m[1])) { c.body = body.body; return send(200, c); }
      return send(404, {});
    }
    if ((m = p.match(/^\/issues\/(\d+)\/labels(?:\/(.+))?$/))) {
      const i = db.issues.get(Number(m[1]));
      if (req.method === "POST") { for (const n of body.labels) if (!i.labels.some((l) => l.name === n)) i.labels.push({ name: n }); return send(200, i.labels); }
      const name = decodeURIComponent(m[2]);
      if (!i.labels.some((l) => l.name === name)) return send(404, { message: "Label does not exist" });
      i.labels = i.labels.filter((l) => l.name !== name);
      return send(200, i.labels);
    }
    if ((m = p.match(/^\/issues\/(\d+)\/assignees$/))) {
      const i = db.issues.get(Number(m[1]));
      if (req.method === "POST") i.assignees = [...new Set([...i.assignees, ...body.assignees])];
      else i.assignees = i.assignees.filter((a) => !body.assignees.includes(a));
      return send(201, view(i));
    }
    send(404, { message: `unhandled ${req.method} ${p}` });
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// ------------------------------------------------------------------- helpers
let dir;
async function script(name, event, extraArgs = []) {
  dir ??= await mkdtemp(join(tmpdir(), "ideas-"));
  const eventPath = join(dir, "event.json");
  await writeFile(eventPath, JSON.stringify(event ?? {}));
  const { stdout } = await run("node", [join(ROOT, "scripts", name), ...extraArgs], {
    cwd: ROOT,
    env: { ...process.env, GITHUB_API_URL: base, GITHUB_TOKEN: "t", GITHUB_REPOSITORY: REPO, GITHUB_EVENT_PATH: eventPath },
  });
  return stdout;
}
const labelsOf = (n) => db.issues.get(n).labels.map((l) => l.name).sort();
const issueEvent = (n, action, extra = {}) => ({ action, issue: view(db.issues.get(n)), ...extra });
const commentOn = (n, login, text, association = "NONE") => {
  const c = { id: db.nextComment++, user: { login, type: "User" }, body: text, author_association: association };
  db.issues.get(n).comments.push(c);
  return { action: "created", issue: view(db.issues.get(n)), comment: c };
};
const lastComment = (n) => db.issues.get(n).comments.at(-1).body;

const BODY = `### One-line summary\n\nTest idea\n\n### The idea\n\nDetails.\n\n### Area\n\nAI control & monitoring\n\n### Rough size\n\nA weekend\n\n### Mentorship\n\nI'd mentor someone on this\n\n### Claiming\n\nOpen: several people can work on it at once`;

// --------------------------------------------------------------------- tests
test("trusted poster: auto-approved, labels synced, claim box created", async () => {
  newIssue(1, "oz", BODY, ["idea"], "OWNER");
  await script("triage.mjs", issueEvent(1, "opened"));
  assert.deepEqual(labelsOf(1), ["approved", "area:control", "idea", "mentorship:mentor", "size:weekend", "status:available"]);
  assert.match(db.issues.get(1).comments[0].body, /Who's working on this/);
});

test("untrusted poster: needs review until approved", async () => {
  newIssue(2, "stranger", BODY, ["idea"]);
  await script("triage.mjs", issueEvent(2, "opened"));
  assert.ok(labelsOf(2).includes("needs-review"));
  assert.ok(!labelsOf(2).includes("approved"));
  // Claims refused before approval
  await script("handle-comment.mjs", commentOn(2, "alice", "/claim"));
  assert.match(lastComment(2), /hasn't been approved/);
  // Maintainer approves
  db.issues.get(2).labels.push({ name: "approved" });
  await script("triage.mjs", issueEvent(2, "labeled", { label: { name: "approved" } }));
  assert.ok(!labelsOf(2).includes("needs-review"));
  assert.ok(labelsOf(2).includes("status:available"));
});

test("claim, second claim, release, done", async () => {
  await script("handle-comment.mjs", commentOn(1, "alice", "/claim"));
  assert.deepEqual(db.issues.get(1).assignees, ["alice"]);
  assert.ok(labelsOf(1).includes("status:claimed") && !labelsOf(1).includes("status:available"));
  assert.match(lastComment(1), /it's yours/);

  await script("handle-comment.mjs", commentOn(1, "bob", "I'll help\n/claim"));
  assert.deepEqual(db.issues.get(1).assignees, ["alice", "bob"]);
  assert.match(lastComment(1), /@alice/);

  await script("handle-comment.mjs", commentOn(1, "bob", "/release"));
  assert.deepEqual(db.issues.get(1).assignees, ["alice"]);

  // Only one state comment ever exists
  assert.equal(db.issues.get(1).comments.filter((c) => c.user.login === BOT.login && c.body.includes("idea-claims:v1")).length, 1);

  // Edit changes field labels
  db.issues.get(1).body = BODY.replace("A weekend", "About 3 months");
  await script("triage.mjs", issueEvent(1, "edited"));
  assert.ok(labelsOf(1).includes("size:quarter") && !labelsOf(1).includes("size:weekend"));
});

test("site data reflects claims", async () => {
  const out = join(dir, "ideas.json");
  await script("build-data.mjs", null, [out]);
  const data = JSON.parse(await readFile(out, "utf8"));
  assert.equal(data.ideas.length, 2);
  const one = data.ideas.find((i) => i.number === 1);
  assert.equal(one.title, "Idea 1");
  assert.equal(one.area, "control");
  assert.deepEqual(one.claims.map((c) => c.user), ["alice"]);
});

test("stale check reminds, then releases", async () => {
  // Age alice's claim by rewriting the state comment.
  const i = db.issues.get(1);
  const sc = i.comments.find((c) => c.body.includes("idea-claims:v1"));
  const enc = sc.body.match(/idea-claims:v1 (\S+) -->/)[1];
  const state = JSON.parse(Buffer.from(enc, "base64").toString());
  state.claims[0].renewedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  sc.body = sc.body.replace(enc, Buffer.from(JSON.stringify(state)).toString("base64"));

  let out = await script("check-stale.mjs");
  assert.match(out, /1 reminders sent, 0 claims released/);
  assert.match(lastComment(1), /@alice it's been 30 days/);

  // Age the reminder past the grace period.
  const enc2 = sc.body.match(/idea-claims:v1 (\S+) -->/)[1];
  const s2 = JSON.parse(Buffer.from(enc2, "base64").toString());
  s2.claims[0].remindedAt = new Date(Date.now() - 8 * 86400000).toISOString();
  sc.body = sc.body.replace(enc2, Buffer.from(JSON.stringify(s2)).toString("base64"));

  out = await script("check-stale.mjs");
  assert.match(out, /0 reminders sent, 1 claims released/);
  assert.deepEqual(i.assignees, []);
  assert.ok(labelsOf(1).includes("status:available") && !labelsOf(1).includes("status:claimed"));
});

test("regression: issue created with extra labels, only a 'labeled' run survives", async () => {
  // GitHub fires opened + one labeled event per label; concurrency cancels all
  // but the last queued run, which may be a "labeled" event.
  newIssue(3, "oz", BODY.replace("AI control & monitoring", "Mechanistic interpretability"), ["idea", "area:interp", "area:model-organisms"], "OWNER");
  await script("triage.mjs", issueEvent(3, "labeled", { label: { name: "area:model-organisms" } }));
  assert.deepEqual(labelsOf(3), ["approved", "area:interp", "idea", "mentorship:mentor", "size:weekend", "status:available"]);
  assert.equal(db.issues.get(3).comments.length, 1);
  // A second run is a no-op (idempotent).
  await script("triage.mjs", issueEvent(3, "opened"));
  assert.equal(db.issues.get(3).comments.length, 1);
});

test("regression: untrusted poster only gets one review comment across runs", async () => {
  newIssue(4, "stranger2", BODY, ["idea"]);
  await script("triage.mjs", issueEvent(4, "labeled", { label: { name: "idea" } }));
  await script("triage.mjs", issueEvent(4, "opened"));
  assert.ok(labelsOf(4).includes("needs-review"));
  assert.equal(db.issues.get(4).comments.length, 1);
});
