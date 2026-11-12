# BriefLab

English writing practice from *The Economist · The World in Brief*.

## Website
https://logan-ycl.github.io/wib-cloze/

The site opens directly to fill-in-the-blank writing exercises. Answers and explanations appear **only after submission**. Missed expressions enter a spaced-repetition queue for later days. Progress is stored locally in the browser, with manual JSON import/export under 学习记录. The public site contains no hosting or setup jargon.

## Daily data source and publishing

**Primary source:** the user's subscribed Economist email, read by the already connected Gmail integration inside the scheduled ChatGPT task **BriefLab 每日 Gmail 出题**. The task is configured for approximately **21:30 Asia/Singapore daily**, after the newsletter normally arrives. It creates new original practice sentences using genuine phrases, words and reporting logic from the mail, updates `content/latest.json`, and appends to `content/catalog.json` through the connected GitHub integration.

This task was created on 2026-11-12. Successful future email access and updates must be verified from task runs. The original email body, personal inbox URLs, and private details must **never** be published in this public repo. The public study material contains only short target expressions and new original example sentences.

**Fallback, manually triggered only:** `.github/workflows/daily.yml` provides an OpenAI API-based generator from publicly available podcast previews. It is deliberately **not scheduled** because the preview is incomplete and must not overwrite an email-based lesson. To use it manually, add an `OPENAI_API_KEY` repository secret, then trigger `Manual Fallback - Public Podcast Preview`. ChatGPT Plus and API billing are separate. This optional API route does not read Gmail and does not represent the full Economist article.

## Format
`content/latest.json` holds the current issue and its cloze items.
`content/catalog.json` holds the cumulative question bank; item IDs are preserved across updates to keep review histories aligned.

Each item needs `id,date,type,expression,meaning_zh,example,analysis_zh,cloze,answer,accepted,hint_zh,why_zh`. The blank must be exactly `______` once; `example` equals cloze with answer inserted.

## Deploy
The `Publish BriefLab Website` workflow in `.github/workflows/pages.yml` publishes a static copy of `index.html` and both JSON files to GitHub Pages after pushes to `main`. In Settings → Pages, Source must be GitHub Actions. Repository code should never include API secrets.

## Dates and privacy
An issue's date is its newsletter edition date, which can differ from the delivery date. The first quiz for a given issue appears on the next Singapore calendar day. All review records live in this browser's localStorage. GitHub does not store the user's submitted answers or incorrect attempts.

Read the Economist using your own subscription. This companion does not republish the full article.
