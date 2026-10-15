import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseIssueBody, parseCommand, applyCommand, checkStale, emptyState,
  renderStateComment, readStateComment, isStateComment, statusLabels, fieldLabels, cleanTitle,
} from "../scripts/lib.mjs";
import { FIELDS, AREAS, SIZES, MENTORSHIP, CLAIM_MODES } from "../scripts/schema.mjs";

const DAY = 86400000;
const t0 = new Date("2026-10-01T12:00:00Z");
const at = (days) => new Date(t0.getTime() + days * DAY);

// What GitHub generates from the issue form.
const body = `### One-line summary

Do SAE features for refusal transfer across model sizes?

### The idea

Some **markdown** here.

With two paragraphs.

### Suggested first steps

_No response_

### Useful background

PyTorch

### Area

Mechanistic interpretability

### Rough size

About a month

### Mentorship

I can give async feedback (e.g. review a draft)

### Claiming

Exclusive: one claim at a time

### Related work / links

_No response_`;

test("parses issue form body", () => {
  const f = parseIssueBody(body);
  assert.equal(f.summary, "Do SAE features for refusal transfer across model sizes?");
  assert.match(f.description, /two paragraphs/);
  assert.equal(f.firstSteps, "");
  assert.equal(f.area, "interp");
  assert.equal(f.size, "month");
  assert.equal(f.mentorship, "async");
  assert.equal(f.claimMode, "exclusive");
  assert.deepEqual(fieldLabels(f), ["area:interp", "mentorship:async", "size:month", "exclusive"]);
});

test("unknown dropdown values fall back safely", () => {
  const f = parseIssueBody("### Area\n\nSomething new\n");
  assert.equal(f.area, "other");
  assert.equal(f.claimMode, "open");
  assert.equal(f.mentorship, "none");
});

test("issue form headings and options match schema", async () => {
  const yml = await readFile(new URL("../.github/ISSUE_TEMPLATE/idea.yml", import.meta.url), "utf8");
  for (const label of Object.values(FIELDS)) assert.ok(yml.includes(`label: ${label}`), `missing field ${label}`);
  for (const table of [AREAS, SIZES, MENTORSHIP, CLAIM_MODES])
    for (const opt of Object.keys(table)) assert.ok(yml.includes(opt), `missing option ${opt}`);
});

test("parses commands", () => {
  assert.deepEqual(parseCommand("/claim"), { type: "claim", mode: "collab" });
  assert.deepEqual(parseCommand("Hi!\n/claim solo please"), { type: "claim", mode: "solo" });
  assert.deepEqual(parseCommand("/renew got baseline working"), { type: "renew", note: "got baseline working" });
  assert.deepEqual(parseCommand("/unclaim"), { type: "release" });
  assert.deepEqual(parseCommand("/done https://x.y"), { type: "done", link: "https://x.y" });
  assert.equal(parseCommand("see a/claim or /claimed"), null);
  assert.equal(parseCommand("just chatting"), null);
});

const ctx = (actor, now, extra = {}) => ({ actor, now, claimMode: "open", ideaAuthor: "poster", isMaintainer: false, ...extra });

test("open idea: several people can claim", () => {
  let r = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0));
  assert.ok(r.ok);
  assert.deepEqual(r.assign, ["alice"]);
  r = applyCommand(r.state, { type: "claim", mode: "solo" }, ctx("bob", at(1)));
  assert.ok(r.ok);
  assert.match(r.reply, /@alice/);
  assert.equal(r.state.claims.length, 2);
});

test("exclusive idea: second claim rejected", () => {
  const c = { claimMode: "exclusive" };
  let r = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0, c));
  const r2 = applyCommand(r.state, { type: "claim", mode: "collab" }, ctx("bob", at(1), c));
  assert.equal(r2.ok, false);
  assert.equal(r2.state, r.state);
  assert.match(r2.reply, /exclusive/);
});

test("renew requires a claim and a note", () => {
  let r = applyCommand(emptyState(), { type: "renew", note: "x" }, ctx("alice", t0));
  assert.equal(r.ok, false);
  r = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0));
  const noNote = applyCommand(r.state, { type: "renew", note: "" }, ctx("alice", at(5)));
  assert.equal(noNote.ok, false);
  const ok = applyCommand(r.state, { type: "renew", note: "progress" }, ctx("alice", at(5)));
  assert.ok(ok.ok);
  assert.equal(ok.state.claims[0].renewedAt, at(5).toISOString());
  assert.equal(ok.state.claims[0].note, "progress");
});

test("release and done", () => {
  let r = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0));
  const rel = applyCommand(r.state, { type: "release" }, ctx("alice", at(1)));
  assert.equal(rel.state.claims.length, 0);
  assert.deepEqual(rel.unassign, ["alice"]);
  const stranger = applyCommand(r.state, { type: "done", link: "x" }, ctx("eve", at(1)));
  assert.equal(stranger.ok, false);
  const done = applyCommand(r.state, { type: "done", link: "https://arxiv.org/abs/1" }, ctx("alice", at(40)));
  assert.ok(done.ok);
  assert.equal(done.state.claims.length, 0);
  assert.equal(done.state.results[0].link, "https://arxiv.org/abs/1");
  const authorDone = applyCommand(emptyState(), { type: "done", link: "" }, ctx("poster", at(2)));
  assert.ok(authorDone.ok);
});

test("stale check: remind at 30 days, lapse 7 days later, renew resets", () => {
  let s = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0)).state;
  let c = checkStale(s, at(29));
  assert.deepEqual([c.remind, c.lapse], [[], []]);
  c = checkStale(s, at(30));
  assert.deepEqual(c.remind, ["alice"]);
  s = c.state;
  c = checkStale(s, at(31)); // no double reminder
  assert.deepEqual([c.remind, c.lapse], [[], []]);
  const renewed = applyCommand(s, { type: "renew", note: "still going" }, ctx("alice", at(33))).state;
  c = checkStale(renewed, at(40));
  assert.deepEqual([c.remind, c.lapse], [[], []]);
  c = checkStale(s, at(37));
  assert.deepEqual(c.lapse, ["alice"]);
  assert.equal(c.state.claims.length, 0);
});

test("state comment round-trips, including awkward notes", () => {
  let s = applyCommand(emptyState(), { type: "claim", mode: "collab" }, ctx("alice", t0)).state;
  s = applyCommand(s, { type: "renew", note: "tricky | pipe --> and <!-- comment" }, ctx("alice", at(2))).state;
  const md = renderStateComment(s);
  assert.ok(isStateComment(md));
  assert.deepEqual(readStateComment(md), s);
  assert.deepEqual(readStateComment("no marker"), emptyState());
  assert.match(md, /\\\|/);
});

test("status labels", () => {
  assert.deepEqual(statusLabels(emptyState()), { add: ["status:available"], remove: ["status:claimed"] });
  assert.deepEqual(statusLabels({ claims: [{}], results: [{}] }), { add: ["status:claimed", "has-result"], remove: ["status:available"] });
});

test("cleanTitle", () => assert.equal(cleanTitle("[Idea] Probe for X"), "Probe for X"));
