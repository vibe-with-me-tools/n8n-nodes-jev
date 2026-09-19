# Changelog

## 0.2.1 - 2026-09-19

### Documentation

- Describe the package as a helper n8n community node maintained by Brains of Bots, not by TypeSafe, and say where to get support

## 0.2.0 - 2026-09-19

First published release.

### Operations

- **Ask Questions**: ask Choice, Score, and Noul questions about each item, all answered in one request
- **Route by Choice**: one output per route, chosen by Jev, plus an optional **Low Confidence** output below a threshold you set

### Features

- State from text, JSON, or the whole input item
- Questions defined with fields or as raw JSON, including structured instructions and criteria
- Model picker loaded from `GET /v1/models`, or a pinned version ID
- Simplified output (`<id>`, `<id>_confidence`, `<id>_level`, `_model`) or the full API response
- Automatic retries with backoff on `429` and `529`, honoring `retry-after`
- Usable as an AI Agent tool
- Example workflows for ticket triage, team routing, and message screening

### Development

- Test suite (Vitest), CI workflow, and publishing from GitHub Actions with npm provenance
