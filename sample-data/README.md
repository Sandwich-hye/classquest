# Sample Data (synthetic / DEMO)

> **All content in this folder is synthetic sample data created for demonstration only.**
> It is NOT real student data and does NOT represent real ClassQuest users, schools, or research
> results (research traceability brief §8, §20; report §2.4 privacy).

Used only when `DEMO_MODE=true` (the default for the LocalStack stack):

- **At App Tier start-up**, the accounts in `users.json` are created if they do not already exist.
  Passwords are stored in this file in plain text (they are public demo credentials) and are
  bcrypt-hashed when inserted into MySQL. Existing accounts are never modified.
- **Seed demo catalogue** (Operations → Demonstration Controls, or `npm run demo:seed`) publishes
  every entry in `catalog.json` through the normal upload path (S3 → MySQL → SQS → worker). Entries
  already present are skipped. Seeded assets are flagged `is_demo = true` and labelled `DEMO` in the UI.

## Files

| File | Purpose |
|------|---------|
| `users.json` | Demo accounts: one student, one teacher, one admin. |
| `catalog.json` | Title, type, content type and file name for each sample resource. |
| `assets/*` | Small synthetic files: two text documents, a minimal PDF (book) and an MP4 stub (video), stored under the `documents/` and `videos/` S3 prefixes. |

## Replacing with other demo content

Add files to `assets/`, describe them in `catalog.json` (type `document`, `book` or `video` with an
allowed content type), then run the seed again. `sample-data/` is mounted read-only into the App
Tier container, so no rebuild is needed.
