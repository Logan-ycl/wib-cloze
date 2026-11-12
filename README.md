# BriefLab | Economist English Trainer

Independent learning companion for *The Economist*'s The World in Brief.

## Fixed URL
After one-time GitHub Pages authorization, the site address is:

https://logan-ycl.github.io/wib-cloze/

In repository **Settings → Pages → Build and deployment**, set **Source = GitHub Actions** and save. The deployment workflow is already committed at `.github/workflows/pages.yml`; then open **Actions → Publish BriefLab Website → Run workflow** once to publish. Future content changes deploy automatically. Setting up the Pages site requires GitHub administrator permissions that are not exposed to this connected editor.

## Daily workflow
The site presents original bilingual expression notes, next-day open-ended fill-in exercises, due reviews from earlier editions, a wrong-answer list, and statistics. The browser saves progress in localStorage; export/import JSON for backup and moving to a new device.

The GitHub Actions workflow `.github/workflows/daily.yml` runs around 09:00 and 13:00 **Asia/Singapore**. Scheduled GitHub jobs may be delayed. It runs `scripts/update_daily.py`, which reads the **public description of the Economist's The World in Brief podcast**, then uses the OpenAI API to generate 3 to 6 original learning notes. Expressions are checked against source text. It commits the resulting `content/latest.json` and `content/catalog.json`. The site always shows the actual content date.

**Required for automatic updates:** In repository **Settings → Secrets and variables → Actions**, create a repository secret named `OPENAI_API_KEY`. Only the account owner can securely provide an API key, and the GitHub code connection does not expose a secret-editing operation. API costs are separate from a ChatGPT Plus subscription. Then go to **Actions → Build Daily BriefLab Edition → Run workflow** and verify that the action finishes successfully and commits new JSON.

### Important source limitation
This public-preview mode covers only words and expressions available in the podcast's public description. It does **not** retrieve or represent the complete subscription article. To analyse the full text of The Economist's daily column, a licensed Economist content integration or a user-provided article is required. The site doesn't bypass paywalls or republish the original article.

The initial 2026-11-11 course is explicitly labelled **DEMO** and is made of original generic sample sentences, not factually sourced news. It is replaced after the first successful generator run.

### Review logic
New material appears in the quiz on the next calendar day (Singapore time). Incorrect answers reappear the following day; correct ones return after 3, 7, 14, 30 and 60 days as their correct streak increases. The previous wrong-answer history remains visible for reference. Review history is stored in the user's **current browser**, not in GitHub or ChatGPT Memory. Clearing browser data can remove it.

### Run and validate
```bash
python scripts/update_daily.py --validate-only
python -m http.server 8000
```
Open http://localhost:8000 to preview.

Official reading link: https://www.economist.com/the-world-in-brief
