# Sample Data (synthetic / DEMO)

> **All content in this folder is synthetic sample data created for demonstration only.**
> It is NOT real student data and does NOT represent real ClassQuest users, schools, or research
> results (research traceability brief §8, §20; report §2.4 privacy).

The demo seed (`npm run demo:seed`) loads these records so an evaluator can run the primary
workflow immediately. Every seeded asset is flagged `is_demo = true` in MySQL and labelled
`DEMO/SAMPLE` in the UI.

## Files

| File | Purpose |
|------|---------|
| `users.json` | Demo accounts: one student, one teacher, one admin (bcrypt-hashed passwords). |
| `assets/*` | Small synthetic learning assets (text documents, a tiny image, a tiny video stub) matching the report's `documents/ pictures/ videos/` S3 prefixes (§5.4.2). |
| `catalog.json` | Metadata describing each sample asset (title, type, subject, year level). |

## Replacing with a real dataset

To use a real dataset later: drop files into `assets/`, update `catalog.json`, and re-run the seed.
The schema mirrors the report's data requirements, so no code changes are needed.
