// Creates (or updates) every label the automation uses, with colors.

import { AREAS, SIZES, MENTORSHIP, LABELS } from "./schema.mjs";
import { REPO, gh } from "./github.mjs";

const labels = [
  [LABELS.idea, "5319e7", "A research idea"],
  [LABELS.approved, "0e8a16", "Approved; shown on the site"],
  [LABELS.needsReview, "fbca04", "Waiting for a maintainer to approve"],
  [LABELS.available, "c2e0c6", "Nobody is working on this"],
  [LABELS.claimed, "1d76db", "Someone is working on this"],
  [LABELS.done, "0e8a16", "At least one result has been posted"],
  [LABELS.exclusive, "d93f0b", "One claim at a time"],
  ...Object.entries(AREAS).map(([name, slug]) => [LABELS.area(slug), "ededed", name]),
  ...Object.entries(SIZES).map(([name, slug]) => [LABELS.size(slug), "f9d0c4", name]),
  ...Object.entries(MENTORSHIP).map(([name, slug]) => [LABELS.mentorship(slug), "bfdadc", name]),
];

for (const [name, color, description] of labels) {
  try {
    await gh("POST", `/repos/${REPO}/labels`, { name, color, description });
    console.log(`created ${name}`);
  } catch (e) {
    if (!String(e.message).includes("-> 422")) throw e;
    await gh("PATCH", `/repos/${REPO}/labels/${encodeURIComponent(name)}`, { color, description });
    console.log(`updated ${name}`);
  }
}
