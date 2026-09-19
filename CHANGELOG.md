# Changelog

## 0.2.0

- **Route by Choice** operation: one output per route, picked by a Jev Choice question
- Optional **Low Confidence** output with a configurable confidence threshold
- Question type selector renamed to **Answer Type** and shown first

## 0.1.0

- Jev node with the **Ask Questions** operation: Choice, Score, and Noul questions answered in one request per item
- State from text, JSON, or the whole input item
- Questions defined with fields or raw JSON (supports structured instructions and criteria)
- Model picker loaded from `GET /v1/models`, or a pinned version ID
- Simplified output (`<id>`, `<id>_confidence`, `<id>_level`, `_model`) or the raw API response
- Automatic retries with backoff on `429` and `529`, honoring `retry-after`
- Usable as an AI Agent tool
