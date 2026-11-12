# BriefLab

Personal English writing trainer based on *The Economist, The World in Brief*.

**Website:** https://logan-ycl.github.io/wib-cloze/

## Current learning flow

- Website homepage opens directly to contextual cloze practice.
- Each snippet presents one coherent multi-sentence news passage with **at least three blanks**, with the number selected for the linguistic value of the expressions.
- **Each blank equals exactly one English word and one text box.** No multiword answers are accepted. The rest of a collocation stays visible for context.
- Every blank has its own **检查** button. Users can grade one blank immediately, without answering the others. Enter checks the focused blank. **提示** reveals the first letter, then the first two, and so on. Feedback appears only for that checked blank. Hinted answers are marked as assisted and scheduled for next-day review, even if written correctly.
- Each target expression has a permanent ID. Incorrect answers are stored in the browser and rescheduled individually; during review the **complete original study passage** with at least three blanks is presented again.
- The "错题本" tab lists missed expressions and lets a user restart the full passage. "学习记录" allows export and import of local browser progress. There is no cross-device server sync yet.

## Format (schema v3)

`content/latest.json`:
```json
{
  "schema_version": 3,
  "edition": {"date": "YYYY-MM-DD", "title": "...", "source_mode": "gmail"},
  "items": [],
  "passages": []
}
```

`content/catalog.json` is the cumulative bank: `{"schema_version":3,"items":[],"passages":[]}`.
All earlier stable item IDs must remain available to preserve local review history.

A passage:
```json
{
  "id": "YYYY-MM-DD-passage-ukraine",
  "date": "YYYY-MM-DD",
  "title": "Ukraine · Negotiations and fighting",
  "body": "Officials held {{YYYY-MM-DD-trilateral-talks}} talks. Their discussion covered {{YYYY-MM-DD-humanitarian}} concerns. The talks were described as {{YYYY-MM-DD-substantive}}."
}
```
The body must be a coherent multi-sentence passage with at least 3 different placeholders; every referenced answer must match the single-word pattern ^[A-Za-z]+$. Each `{{id}}` matches an item with `id,date,type,expression,meaning_zh,example,analysis_zh,cloze,answer,accepted,hint_zh,why_zh`. Existing `cloze` and `example` fields remain as metadata for backward compatibility; the public quiz renders each passage's `body` in full.

## Daily update

The enabled scheduled ChatGPT task **BriefLab 每日 Gmail 出题** reads the newest subscribed Economist newsletter in the connected Gmail account and updates the two JSON files via the connected GitHub tool. Scheduled at approximately **21:30 Asia/Singapore**, first future run not yet validated.

The public training passages are **newly authored, faithful contextual rewrites** based on the news with short real target expressions from the user's email. The full copyrighted newsletter and private inbox information **must not be published**.

A separate `.github/workflows/daily.yml` is a **manually triggered podcast-preview fallback**. It is deliberately not scheduled and does not access private Gmail. It requires a separately billed `OPENAI_API_KEY` secret if ever used. It is not compatible with the preferred email-source full-context daily format without a future implementation update. Avoid running the fallback over the email exercise bank.

## Website deployment

`.github/workflows/pages.yml` publishes `index.html`, `app.js`, and both content JSON files to GitHub Pages automatically when site code or content changes. Pages should use `Source: GitHub Actions`.

## Privacy

This is a public static website. Do not put subscription emails, full paywalled passages, personally identifying information, email links, login cookies, secrets, or users' answers in the repository. Answer history stays in each browser's localStorage.

## Quality gate

Every Pages deployment runs `python3 scripts/validate_cloze.py` before publishing. Any snippet with fewer than three gaps, any duplicate target, or any multiword answer in an active passage fails validation and blocks deployment. Old unused multiword records can remain in the cumulative item archive for learning-history continuity.
