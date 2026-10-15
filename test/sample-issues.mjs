// Example idea issues used to generate site/sample-ideas.json for previews.
// These are illustrative placeholders, not real posts by real people.

const body = (f) => `### One-line summary

${f.summary}

### The idea

${f.idea}

### Suggested first steps

${f.steps || "_No response_"}

### Useful background

${f.bg || "_No response_"}

### Area

${f.area}

### Rough size

${f.size}

### Mentorship

${f.mentor}

### Claiming

${f.exclusive ? "Exclusive: one claim at a time" : "Open: several people can work on it at once"}

### Related work / links

${f.links || "_No response_"}`;

const MENTOR = "I'd mentor someone on this";
const ASYNC = "I can give async feedback (e.g. review a draft)";
const NONE = "No bandwidth, but take it and run";

export const SAMPLE = [
  {
    title: "Do refusal directions transfer across model sizes in the same family?",
    author: "example-interp", created: "2026-10-12",
    f: {
      summary: "Find the refusal direction in a small and a large model from one family and test whether a learned map between them preserves it.",
      idea: "Refusal is often mediated by a single direction in the residual stream. If the direction found in a small model can be mapped onto a larger sibling, cheap experiments on small models could tell us something about the large ones.\n\nA good result is a clear yes or no with an honest account of where the mapping breaks down.",
      steps: "1. Reproduce the difference-of-means refusal direction on two open-weight models of different sizes.\n2. Fit a linear map between their residual streams on a neutral corpus.\n3. Ablate the mapped direction in the large model and measure refusal rate.",
      bg: "PyTorch, TransformerLens or nnsight", area: "Mechanistic interpretability", size: "About a month", mentor: MENTOR,
    },
    claims: [{ user: "example-newcomer", mode: "collab", since: "2026-10-13", renewedAt: "2026-10-13", note: "" }],
  },
  {
    title: "A cheap eval for sandbagging on multiple-choice benchmarks",
    author: "example-evals", created: "2026-10-09",
    f: {
      summary: "Detect deliberate underperformance by comparing accuracy under prompts that make the model believe it is or isn't being evaluated.",
      idea: "Prompt a model to sandbag, then check whether simple signals (answer distribution, confidence on easy items, consistency across paraphrases) flag it without access to weights.",
      bg: "Python, API access to a couple of models", area: "Evals & capability measurement", size: "A weekend", mentor: ASYNC,
    },
    claims: [],
  },
  {
    title: "Trusted monitoring with a weaker model: how much does chain-of-thought access help?",
    author: "example-control", created: "2026-10-05",
    f: {
      summary: "Measure how much a weaker monitor's catch rate improves when it can read the untrusted model's reasoning, not just its actions.",
      idea: "Set up a toy control environment with an attack policy that inserts subtle backdoors into code. Compare monitor performance with and without access to the reasoning trace, and with traces that the attack policy knows will be read.",
      area: "AI control & monitoring", size: "About 3 months", mentor: MENTOR, exclusive: true,
    },
    claims: [{ user: "example-fellow", mode: "solo", since: "2026-09-20", renewedAt: "2026-10-08", note: "Baseline monitor working; now adding the CoT condition" }],
  },
  {
    title: "Does persona prompting change reward-hacking rates in coding environments?",
    author: "example-psych", created: "2026-09-28",
    f: {
      summary: "Test whether system prompts that describe the assistant's character shift how often it special-cases tests.",
      idea: "Take a coding benchmark where reward hacking is measurable (e.g. tests that can be special-cased). Vary only the persona description and compare hacking rates across several models.",
      bg: "None beyond basic Python", area: "Model psychology, personas & welfare", size: "A weekend", mentor: NONE,
    },
    claims: [],
  },
  {
    title: "Sparse autoencoder features that predict jailbreak success",
    author: "example-interp", created: "2026-09-21",
    f: {
      summary: "Find SAE features whose activation on the prompt predicts whether a jailbreak will work, before generation.",
      idea: "Collect a set of jailbreak attempts with known outcomes, run them through a model with a public SAE, and train a sparse probe over features. Inspect the top features by hand.",
      bg: "Familiarity with SAEs", area: "Robustness & adversarial attacks", size: "About a month", mentor: ASYNC,
    },
    claims: [
      { user: "example-student", mode: "collab", since: "2026-09-25", renewedAt: "2026-10-10", note: "Dataset of 2k attempts collected" },
      { user: "example-engineer", mode: "collab", since: "2026-10-02", renewedAt: "2026-10-02", note: "" },
    ],
    results: [],
  },
  {
    title: "Replicate emergent misalignment from narrow finetuning on a small open model",
    author: "example-organisms", created: "2026-09-14",
    f: {
      summary: "Check whether finetuning on insecure code produces broadly misaligned answers in a 1–3B parameter model.",
      idea: "Earlier work found narrow finetuning can cause broad misalignment in large models. Does the effect appear at small scale, where it would be much cheaper to study?",
      area: "Model organisms of misalignment", size: "About a month", mentor: MENTOR,
    },
    claims: [],
    results: [{ user: "example-replicator", link: "https://example.com/writeup", at: "2026-10-01" }],
  },
  {
    title: "How well do debate transcripts help non-experts judge physics questions?",
    author: "example-oversight", created: "2026-09-02",
    f: {
      summary: "Run a small human study where non-physicists judge graduate-level physics questions with and without model debates.",
      idea: "Most debate studies use reading comprehension. Physics questions with verifiable answers are a harder, more realistic test of whether debate helps weaker judges.",
      area: "Scalable oversight", size: "Bigger than that", mentor: ASYNC,
    },
    claims: [],
  },
  {
    title: "Estimating training compute from public model behavior",
    author: "example-gov", created: "2026-08-25",
    f: {
      summary: "Build a regression from cheap behavioral probes to known training compute, as a tool for verifying compute disclosures.",
      idea: "For open models with known compute, measure a battery of capability and calibration probes. See how accurately compute can be predicted for held-out models.",
      area: "Technical governance & compute", size: "About 3 months", mentor: NONE,
    },
    claims: [],
  },
];

export function sampleIssues() {
  return SAMPLE.map((s, i) => ({ number: 100 + i, ...s, body: body(s.f) }));
}
