// Pure logic: parsing issue bodies, claim commands and claim state.
// No network access here, so everything is unit-testable (see test/).

import { FIELDS, AREAS, SIZES, MENTORSHIP, CLAIM_MODES, LABELS, CLAIM_RULES } from "./schema.mjs";

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- issue body

/** Parse the markdown GitHub generates from an issue form into fields. */
export function parseIssueBody(body = "") {
  const sections = {};
  const re = /^###\s+(.+?)\s*$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(body)) !== null) heads.push({ title: m[1], start: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const stop = i + 1 < heads.length ? heads[i + 1].start : body.length;
    let value = body.slice(h.end, stop).trim();
    if (value === "_No response_") value = "";
    sections[h.title] = value;
  });

  const get = (key) => sections[FIELDS[key]] ?? "";
  const lookup = (table, text) => table[text.trim()] ?? null;

  return {
    summary: get("summary"),
    description: get("description"),
    firstSteps: get("firstSteps"),
    prerequisites: get("prerequisites"),
    links: get("links"),
    area: lookup(AREAS, get("area")) ?? "other",
    size: lookup(SIZES, get("size")),
    mentorship: lookup(MENTORSHIP, get("mentorship")) ?? "none",
    claimMode: lookup(CLAIM_MODES, get("claimMode")) ?? "open",
  };
}

/** Labels that should be on an idea issue given its parsed fields. */
export function fieldLabels(fields) {
  const labels = [LABELS.area(fields.area), LABELS.mentorship(fields.mentorship)];
  if (fields.size) labels.push(LABELS.size(fields.size));
  if (fields.claimMode === "exclusive") labels.push(LABELS.exclusive);
  return labels;
}

export function isFieldLabel(name) {
  return /^(area|size|mentorship):/.test(name) || name === LABELS.exclusive;
}

// ------------------------------------------------------------------ commands

/**
 * Find the first slash command in a comment. Returns null if none.
 *   /claim            working on it, open to collaborators
 *   /claim solo       working on it, not looking for collaborators
 *   /renew <note>     still working; one line on progress is required
 *   /release          stop working on it
 *   /done <link>      post a result (paper, post, repo)
 */
export function parseCommand(text = "") {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^\/(claim|renew|release|unclaim|done)\b\s*(.*)$/i);
    if (!m) continue;
    const verb = m[1].toLowerCase();
    const rest = m[2].trim();
    if (verb === "claim") return { type: "claim", mode: /^solo\b/i.test(rest) ? "solo" : "collab" };
    if (verb === "renew") return { type: "renew", note: rest };
    if (verb === "release" || verb === "unclaim") return { type: "release" };
    if (verb === "done") return { type: "done", link: rest };
  }
  return null;
}

// --------------------------------------------------------------- claim state

export const emptyState = () => ({ claims: [], results: [] });

const MARKER = "idea-claims:v1";

/** Serialize state into a bot comment (human-readable table + hidden data). */
export function renderStateComment(state) {
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  const lines = ["### Who's working on this", ""];
  if (state.claims.length === 0) {
    lines.push("Nobody right now. Comment `/claim` to start (or `/claim solo` if you'd rather work alone).");
  } else {
    lines.push("| Who | Collaborators? | Since | Last update |", "|---|---|---|---|");
    for (const c of state.claims) {
      const note = c.note ? ` ${escapeCell(c.note)}` : "";
      lines.push(`| @${c.user} | ${c.mode === "solo" ? "Working solo" : "Welcome"} | ${day(c.since)} | ${day(c.renewedAt)}${note ? " —" + note : ""} |`);
    }
  }
  if (state.results.length) {
    lines.push("", "### Results", "");
    for (const r of state.results) lines.push(`- @${r.user} (${day(r.at)})${r.link ? `: ${r.link}` : ""}`);
  }
  lines.push(
    "",
    `<sub>Claims last ${CLAIM_RULES.renewAfterDays} days. Renew with \`/renew <one line on progress>\`, stop with \`/release\`, post a result with \`/done <link>\`. This comment is maintained automatically.</sub>`,
    `<!-- ${MARKER} ${encoded} -->`
  );
  return lines.join("\n");
}

export function isStateComment(body = "") {
  return body.includes(`<!-- ${MARKER} `);
}

export function readStateComment(body = "") {
  const m = body.match(new RegExp(`<!-- ${MARKER} ([A-Za-z0-9+/=]+) -->`));
  if (!m) return emptyState();
  try {
    const s = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
    return { claims: s.claims ?? [], results: s.results ?? [] };
  } catch {
    return emptyState();
  }
}

/**
 * Apply a command to the claim state.
 * ctx: { actor, now: Date, claimMode: "open"|"exclusive", ideaAuthor, isMaintainer }
 * Returns { state, ok, reply, assign: [users], unassign: [users] }.
 */
export function applyCommand(prev, cmd, ctx) {
  const state = structuredClone(prev);
  const now = ctx.now.toISOString();
  const mine = state.claims.find((c) => c.user === ctx.actor);
  const others = state.claims.filter((c) => c.user !== ctx.actor);
  const out = (ok, reply, extra = {}) => ({ state: ok ? state : prev, ok, reply, assign: [], unassign: [], ...extra });
  const due = (iso) => day(new Date(new Date(iso).getTime() + CLAIM_RULES.renewAfterDays * DAY).toISOString());

  switch (cmd.type) {
    case "claim": {
      if (mine) {
        mine.mode = cmd.mode;
        mine.renewedAt = now;
        mine.remindedAt = null;
        return out(true, `@${ctx.actor} updated your claim (${cmd.mode === "solo" ? "working solo" : "open to collaborators"}). Next renewal due ${due(now)}.`);
      }
      if (ctx.claimMode === "exclusive" && others.length) {
        const c = others[0];
        return out(false, `@${ctx.actor} this idea is marked exclusive and @${c.user} has claimed it (renewal due ${due(c.renewedAt)}). If the claim lapses it becomes available again. You could also ask @${c.user} here whether they'd like a collaborator.`);
      }
      if (state.claims.length >= CLAIM_RULES.maxClaimants) {
        return out(false, `@${ctx.actor} this idea already has ${CLAIM_RULES.maxClaimants} people on it, the most GitHub can track. Consider joining one of them instead.`);
      }
      state.claims.push({ user: ctx.actor, mode: cmd.mode, since: now, renewedAt: now, note: "", remindedAt: null });
      const collabNote = others.length
        ? ` ${others.length === 1 ? "Someone else is" : `${others.length} others are`} also working on this: ${others.map((c) => `@${c.user}`).join(", ")}. It may be worth saying hello.`
        : "";
      return out(
        true,
        `@${ctx.actor} it's yours${ctx.claimMode === "open" ? " (alongside anyone else who claims it)" : ""}. ` +
          `You'll get a reminder in ${CLAIM_RULES.renewAfterDays} days; reply \`/renew <one line on progress>\` to keep the claim, or \`/release\` if you stop.${collabNote}`,
        { assign: [ctx.actor] }
      );
    }

    case "renew": {
      if (!mine) return out(false, `@${ctx.actor} you don't have a claim on this idea. Use \`/claim\` to start one.`);
      if (!cmd.note) return out(false, `@${ctx.actor} please add one line on progress, e.g. \`/renew replicated baseline, now trying layer 12\`.`);
      mine.renewedAt = now;
      mine.note = cmd.note.slice(0, 200);
      mine.remindedAt = null;
      return out(true, `@${ctx.actor} renewed. Next renewal due ${due(now)}.`);
    }

    case "release": {
      if (!mine) return out(false, `@${ctx.actor} you don't have a claim on this idea.`);
      state.claims = others;
      return out(true, `@${ctx.actor} released. Thanks for letting people know.`, { unassign: [ctx.actor] });
    }

    case "done": {
      const allowed = mine || ctx.actor === ctx.ideaAuthor || ctx.isMaintainer;
      if (!allowed) return out(false, `@${ctx.actor} only someone with a claim, the idea's author or a maintainer can post a result. Use \`/claim\` first.`);
      state.results.push({ user: ctx.actor, link: cmd.link.slice(0, 300), at: now });
      state.claims = others;
      return out(true, `@${ctx.actor} result recorded${cmd.link ? "" : " (add a link with `/done <link>` next time so others can find it)"}. Congratulations!`, {
        unassign: mine ? [ctx.actor] : [],
      });
    }
  }
  return out(false, "");
}

/**
 * Check claims for staleness.
 * Returns { state, remind: [users], lapse: [users] }.
 */
export function checkStale(prev, now) {
  const state = structuredClone(prev);
  const remind = [];
  const lapse = [];
  const t = now.getTime();
  state.claims = state.claims.filter((c) => {
    const sinceRenew = t - new Date(c.renewedAt).getTime();
    if (c.remindedAt) {
      if (t - new Date(c.remindedAt).getTime() >= CLAIM_RULES.graceDays * DAY) {
        lapse.push(c.user);
        return false;
      }
      return true;
    }
    if (sinceRenew >= CLAIM_RULES.renewAfterDays * DAY) {
      c.remindedAt = now.toISOString();
      remind.push(c.user);
    }
    return true;
  });
  return { state, remind, lapse };
}

/** Status labels implied by a state. */
export function statusLabels(state) {
  return {
    add: [state.claims.length ? LABELS.claimed : LABELS.available, ...(state.results.length ? [LABELS.done] : [])],
    remove: [state.claims.length ? LABELS.available : LABELS.claimed],
  };
}

// --------------------------------------------------------------------- utils

function day(iso) {
  return iso ? iso.slice(0, 10) : "";
}

function escapeCell(s) {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function cleanTitle(title = "") {
  return title.replace(/^\s*\[idea\]\s*/i, "").trim();
}
