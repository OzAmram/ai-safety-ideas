// Single source of truth for idea fields, label names and claim rules.
// The issue form (.github/ISSUE_TEMPLATE/idea.yml) must use the same
// headings; test/schema.test.mjs checks that they stay in sync.

export const FIELDS = {
  summary: "One-line summary",
  description: "The idea",
  firstSteps: "Suggested first steps",
  prerequisites: "Useful background",
  area: "Area",
  size: "Rough size",
  mentorship: "Mentorship",
  claimMode: "Claiming",
  links: "Related work / links",
};

// Dropdown option text -> short slug used in labels and on the site.
export const AREAS = {
  "Mechanistic interpretability": "interp",
  "Evals & capability measurement": "evals",
  "AI control & monitoring": "control",
  "Model organisms of misalignment": "model-organisms",
  "Scalable oversight": "oversight",
  "Alignment training & RL": "training",
  "Model psychology, personas & welfare": "psychology",
  "Robustness & adversarial attacks": "robustness",
  "Technical governance & compute": "governance",
  "Other": "other",
};

export const SIZES = {
  "A weekend": "weekend",
  "About a month": "month",
  "About 3 months": "quarter",
  "Bigger than that": "large",
};

export const MENTORSHIP = {
  "I'd mentor someone on this": "mentor",
  "I can give async feedback (e.g. review a draft)": "async",
  "No bandwidth, but take it and run": "none",
};

export const CLAIM_MODES = {
  "Open: several people can work on it at once": "open",
  "Exclusive: one claim at a time": "exclusive",
};

export const LABELS = {
  idea: "idea",
  approved: "approved",
  needsReview: "needs-review",
  available: "status:available",
  claimed: "status:claimed",
  done: "has-result",
  exclusive: "exclusive",
  area: (slug) => `area:${slug}`,
  size: (slug) => `size:${slug}`,
  mentorship: (slug) => `mentorship:${slug}`,
};

export const CLAIM_RULES = {
  renewAfterDays: 30, // claim must be renewed this often
  graceDays: 7, // after the reminder, how long before the claim lapses
  maxClaimants: 10, // GitHub's assignee limit
};

// Display names the site uses for each slug (written into ideas.json).
const invert = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [v, k]));
export const SITE_META = {
  areas: invert(AREAS),
  sizes: invert(SIZES),
  sizeOrder: Object.values(SIZES),
  mentorship: { mentor: "Mentor available", async: "Async feedback", none: "No mentorship" },
  claimRules: CLAIM_RULES,
};
