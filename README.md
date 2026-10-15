# Open problems in AI safety

A public list of AI safety research ideas that anyone can pick up. Researchers post ideas as GitHub issues and say whether they'd mentor someone on them. People working on an idea claim it with a comment, renew the claim monthly, and post their results. A browsable site, rebuilt automatically from the issues, makes everything searchable and filterable.

Everything runs on GitHub: issues, Actions and Pages. There is no server or database to maintain.

## How it works

**Posting.** "New issue" opens a form: summary, the idea, first steps, useful background, area, rough size, mentorship offer, and whether the idea is open (several people at once, the default) or exclusive (one claim at a time). Ideas from maintainers and people listed in `.github/trusted-posters.txt` appear immediately. Anyone else's get a `needs-review` label until a maintainer adds `approved`.

**Claiming.** On an approved idea, anyone can comment:

| Command | What it does |
|---|---|
| `/claim` | Start working on it; open to collaborators |
| `/claim solo` | Start working on it; not looking for collaborators |
| `/renew <one line on progress>` | Keep your claim for another 30 days (the note is required) |
| `/release` | Stop working on it |
| `/done <link>` | Post a result (claimants, the idea's author or maintainers) |

The claimant is assigned to the issue, and a single comment at the top of the thread, maintained by the bot, shows who's working on it, their latest progress note, and any results.

**Staleness.** A daily job reminds anyone whose claim hasn't been renewed for 30 days (GitHub emails them because they're @-mentioned). If they don't reply with `/renew` within 7 days, the claim is released. Both periods are set in `scripts/schema.mjs`.

**The site.** Each change re-runs the "Site" workflow, which reads the approved, open ideas into `site/ideas.json` and deploys `site/` to GitHub Pages. Visitors can search, filter by status, mentorship, size and area, sort, and open an idea to read it in full. Filter state is kept in the URL, so filtered views can be linked.

## Setup (about 10 minutes)

1. Create a **public** GitHub repository and push these files to its `main` branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions tab → "Set up labels" → Run workflow.** This creates the labels with colors and descriptions.
4. In `.github/ISSUE_TEMPLATE/config.yml`, replace `OWNER/REPO` with your GitHub username and repository name (this is the "Browse all ideas" link on the new-issue page).
5. Add any researchers whose ideas should skip review to `.github/trusted-posters.txt`.
6. Optional: set a repository variable `SITE_TITLE` (Settings → Secrets and variables → Actions → Variables) to change the site's heading.
7. Post your first idea. The site appears at `https://OWNER.github.io/REPO/` once the "Site" workflow finishes (about a minute).

If a workflow fails with a permissions error, check **Settings → Actions → General → Workflow permissions** and allow read and write.

## Moderating

- Approve an idea: add the `approved` label.
- Hide an idea: remove `approved`, or close the issue. Closed ideas drop off the site.
- Edit an idea: edit the issue body. Labels and the site update automatically.
- Override claims: maintainers can unassign people directly; the bot's claims comment is the source of truth for the site, so also edit or delete that comment if needed.

## Development

Requires Node 20+. No dependencies.

```sh
npm test         # unit tests + integration tests against a fake GitHub API
npm run preview  # serve the site with sample data at http://localhost:8000/?sample
```

- `scripts/schema.mjs`: form fields, dropdown options, labels and claim timings. Keep it in sync with `.github/ISSUE_TEMPLATE/idea.yml` (a test checks this).
- `scripts/lib.mjs`: all parsing and claim logic, no network.
- `scripts/*.mjs`: one entry point per workflow.
- `site/`: the static page (`index.html`, `style.css`, `app.js`).
