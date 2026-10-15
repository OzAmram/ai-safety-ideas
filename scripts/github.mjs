// Minimal GitHub REST client for the Actions scripts (Node 20+ has fetch).

const API = process.env.GITHUB_API_URL || "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
export const REPO = process.env.GITHUB_REPOSITORY; // "owner/name"

export async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

/** GET every page of a list endpoint. */
export async function ghAll(path) {
  const out = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page < 100; page++) {
    const batch = await gh("GET", `${path}${sep}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const BOT = "github-actions[bot]";

/** Find the bot-maintained claims comment on an issue, if any. */
export async function findStateComment(issueNumber, isStateComment) {
  const comments = await ghAll(`/repos/${REPO}/issues/${issueNumber}/comments`);
  return comments.find((c) => c.user?.login === BOT && isStateComment(c.body)) ?? null;
}

export async function upsertStateComment(issueNumber, existing, body) {
  if (existing) return gh("PATCH", `/repos/${REPO}/issues/comments/${existing.id}`, { body });
  return gh("POST", `/repos/${REPO}/issues/${issueNumber}/comments`, { body });
}

export const comment = (n, body) => gh("POST", `/repos/${REPO}/issues/${n}/comments`, { body });

export async function addLabels(n, labels) {
  if (labels.length) await gh("POST", `/repos/${REPO}/issues/${n}/labels`, { labels });
}

export async function removeLabel(n, label) {
  try {
    await gh("DELETE", `/repos/${REPO}/issues/${n}/labels/${encodeURIComponent(label)}`);
  } catch (e) {
    if (!String(e.message).includes("-> 404")) throw e; // label wasn't there
  }
}

export async function setAssignees(n, add, remove) {
  if (add.length) await gh("POST", `/repos/${REPO}/issues/${n}/assignees`, { assignees: add });
  if (remove.length) await gh("DELETE", `/repos/${REPO}/issues/${n}/assignees`, { assignees: remove });
}

export async function readEvent() {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
}
