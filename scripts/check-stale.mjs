// Runs daily. Reminds claimants after 30 days without a renewal and
// releases claims that go another 7 days without a response.

import { checkStale, readStateComment, renderStateComment, isStateComment, statusLabels } from "./lib.mjs";
import { LABELS, CLAIM_RULES } from "./schema.mjs";
import { REPO, ghAll, findStateComment, upsertStateComment, comment, addLabels, removeLabel, setAssignees } from "./github.mjs";

const issues = await ghAll(`/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(LABELS.claimed)}`);
const now = new Date();
let reminded = 0;
let lapsed = 0;

for (const issue of issues) {
  if (issue.pull_request) continue;
  const existing = await findStateComment(issue.number, isStateComment);
  if (!existing) continue;
  const { state, remind, lapse } = checkStale(readStateComment(existing.body), now);
  if (!remind.length && !lapse.length) continue;

  await upsertStateComment(issue.number, existing, renderStateComment(state));

  if (remind.length) {
    const who = remind.map((u) => `@${u}`).join(" ");
    await comment(
      issue.number,
      `${who} it's been ${CLAIM_RULES.renewAfterDays} days since your last update. Still working on this? ` +
        `Reply \`/renew <one line on progress>\` to keep your claim, or \`/release\` if you've moved on. ` +
        `Without a reply the claim will be released in ${CLAIM_RULES.graceDays} days. (No pressure either way; releasing helps others find open ideas.)`
    );
    reminded += remind.length;
  }
  if (lapse.length) {
    await setAssignees(issue.number, [], lapse);
    await comment(issue.number, `Released the claim${lapse.length > 1 ? "s" : ""} of ${lapse.map((u) => `@${u}`).join(", ")} after no reply to the renewal reminder. You can \`/claim\` again any time.`);
    lapsed += lapse.length;
  }
  const { add, remove } = statusLabels(state);
  await addLabels(issue.number, add);
  for (const l of remove) await removeLabel(issue.number, l);
}

console.log(`Checked ${issues.length} claimed ideas: ${reminded} reminders sent, ${lapsed} claims released.`);
