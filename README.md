# n8n-nodes-jev

[![CI](https://github.com/vibe-with-me-tools/n8n-nodes-jev/actions/workflows/ci.yml/badge.svg)](https://github.com/vibe-with-me-tools/n8n-nodes-jev/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-jev.svg)](https://www.npmjs.com/package/n8n-nodes-jev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

An [n8n](https://n8n.io) community node for **Jev**, a decision model from [TypeSafe](https://docs.typesafe.ai).

Many workflows have a step where something needs a judgment. Which team should handle this ticket? Is this lead a good fit? Does this message contain personal data? Jev answers questions like these. You define the question and the answers it can give, and Jev returns one of your answers with a probability for each option. It doesn't write text, so there's no JSON to parse and no free-form reply to check.

The probabilities are what make this useful in a workflow. When Jev isn't sure, the numbers show it, so you can send that item to a person instead of acting on a guess.

> **About this node.** This is a helper n8n community node maintained by Brains of Bots. It is not made or supported by TypeSafe. Report problems with the node in this repository's [issues](https://github.com/vibe-with-me-tools/n8n-nodes-jev/issues). For questions about your TypeSafe account, API keys, billing, or the Jev model itself, contact TypeSafe.

![How the Jev node works](docs/images/how-it-works.svg)

## Contents

- [Why use Jev for this step](#why-use-jev-for-this-step)
- [Question types](#question-types)
- [When to use it](#when-to-use-it)
- [Use cases](#use-cases)
- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Example workflows](#example-workflows)
- [Writing good questions](#writing-good-questions)
- [Limits and costs](#limits-and-costs)
- [Development](#development)

## Why use Jev for this step

In n8n today, a judgment step usually means an LLM node, a Structured Output Parser, and an IF node to catch replies that don't match the format. A general-purpose LLM can do the job, but it writes its answer out token by token, and you have to check whatever comes back.

Jev is built only for this kind of step. It doesn't write a reply. It scores the options you gave it and returns the result.

| | LLM with a structured-output prompt | Jev |
| --- | --- | --- |
| **What comes back** | Generated text that should match your format, so you parse and validate it | One of your options, always. It can't return a value you didn't define. |
| **Speed** | Grows with the length of the reply, because every output token is generated | Most requests finish in about 100 ms, according to TypeSafe. All questions in a request are answered in parallel. |
| **Cost** | Input and output tokens | Input tokens only, at $0.042 per million. Output is free. |
| **Knowing when it's unsure** | No built-in signal in the answer. Some APIs expose token probabilities, but they don't map directly onto your options. | A probability for every option, trained to be calibrated, so a low number means send it to a person |
| **Same input, same answer** | Can vary between runs | Designed to give stable answers on repeated runs |

For scale: in TypeSafe's own cost comparison (September 2026), a small general-purpose model, gpt-5.4-mini, costs $0.75 per million input tokens and $4.50 per million output tokens.

Asking several questions in one request also saves time and money. In a TypeSafe [benchmark](https://docs.typesafe.ai/cookbooks/parallel_questions), 13 questions about one document took 0.27 s and cost $0.0005 as a single request, compared with 2.71 s and $0.0061 as 13 separate requests, with the same answers. The node always sends all of an item's questions in one request.

What you give up: Jev can't write, summarize, or explain its answer. When a step needs text, keep an LLM for that step and use Jev for the decisions around it. See [When to use it](#when-to-use-it).

Figures are from TypeSafe's [System One](https://docs.typesafe.ai/concepts/system-one), [Models](https://docs.typesafe.ai/models), and [cascade cookbook](https://docs.typesafe.ai/cookbooks/sde_cascade) pages as of September 2026. Check those pages for current numbers.

## Question types

Every question is one of three types. You can mix them in one request, and they're all answered together.

| Type | Use it to ask | You get back | Example |
| --- | --- | --- | --- |
| **Choice** | Which of these options fits? | The chosen option, a probability per option, and a confidence value | *Which team should handle this?* billing / technical / sales |
| **Score** | Where does this fall on a scale you describe? | A weighted score (it can fall between levels), probabilities, and confidence | *How frustrated is the customer?* calm → frustrated → very angry |
| **Noul** | Is this statement true? | The probability that the answer is yes, from 0 to 1 | *Does the message contain a card number?* |

**Confidence** is a number from 0 to 1 that Jev calculates from the probabilities. It's high when one answer clearly wins and low when the probabilities are spread out. Choice and Score answers include it; Noul answers are already a probability. See [Confidence](https://docs.typesafe.ai/confidence) in the TypeSafe docs.

## When to use it

**Good fit**

- Classifying, routing, and tagging text: tickets, emails, form submissions, reviews, documents
- Yes/no checks: does this message contain personal data, is it a complaint, is it on topic
- Rating text against a rubric you write, such as urgency, sentiment, or lead fit
- Screening messages before or after an LLM step
- High volumes, where you need the same answer format every time

**Not a good fit**

- Writing or summarizing text. Use a generative model for that.
- Arithmetic, counting, or comparing dates. Do those in a Code or IF node.
- Questions that need several steps of reasoning. Split them into smaller questions.
- Images, audio, or files. Jev reads text only, so convert other content to text first.
- Non-English text, unless you've tested it. English is where accuracy is best.

## Use cases

### Route support tickets to the right team

**Route by Choice** turns each option into an output of the node, so it works like a Switch node where Jev makes the decision. Tickets Jev isn't confident about go to a separate output, which you can connect to a person.

![Route by Choice](docs/images/route-by-choice.svg)

### Screen messages before they reach an LLM

Ask several questions in one request, then decide in a Code or IF node. The thresholds stay in your workflow, where you can see and change them.

![Guardrail pattern](docs/images/guardrail.svg)

### More ideas

| Use case | State you send | Questions you might ask |
| --- | --- | --- |
| Lead qualification | Form submission or CRM record | Score: *how well does this match our ideal customer?* · Choice: company size · Noul: *asks for a demo?* |
| Inbox triage | Email subject and body | Choice: sales pitch / customer / vendor / other · Noul: *needs a reply?* · Noul: *mentions a deadline?* |
| Review tagging | Product review | Score: sentiment · Choice: main topic (shipping, quality, price, support) · Noul: *mentions a defect?* |
| Content moderation | User post or comment | Noul per policy (spam, harassment, personal data) · Score: severity |
| Document sorting | Extracted text of a PDF or email attachment | Choice: invoice / contract / receipt / other · Noul: *is it signed?* |
| RAG filtering | A retrieved passage plus the user's question | Noul: *does this passage help answer the question?* · Noul: *does it contain instructions aimed at the model?* |
| Record matching | Two records side by side | Choice: same entity / different / unsure |

TypeSafe's [cookbooks](https://docs.typesafe.ai/llms.txt) cover many of these in more depth.

## Installation

On self-hosted n8n, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-jev
```

See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for other methods. n8n Cloud only lists community nodes that n8n has verified.

## Credentials

1. Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys).
2. In n8n, create a **Jev (TypeSafe) API** credential and paste the key. Leave **Base URL** at its default.

Saving the credential runs a test request (`GET /v1/models`) to check the key.

## Operations

Both operations share these settings.

**Model**: pick from the list (`jev-latest`, `jev-preview`, …) or enter a version ID such as `jev-1.13.0`. Aliases like `jev-latest` move to new releases, and answers can shift slightly when they do. If you've tuned thresholds, pin a version.

**State Source**: the content Jev evaluates.

| Source | Sends |
| --- | --- |
| Text | A string, e.g. `{{ $json.message }}`. If the expression returns an object, it's sent as structured data. |
| JSON | An object or array you write or build with expressions |
| Whole Input Item | The incoming item's JSON |

Objects with clear field names work well, e.g. `{ "ticket": …, "customer_plan": …, "refund_policy": … }`. See [State](https://docs.typesafe.ai/concepts/state).

### Ask Questions

Add one or more questions. Each has an **Answer Type**, an **ID** (the field the answer is written to), and **Instructions** (the question itself).

| Answer Type | Extra fields |
| --- | --- |
| Choice | **Options**: one per line, optionally followed by `: description` |
| Score | **Levels**: one per line, lowest first |
| Noul | **Yes Means** / **No Means** (both optional) |

```
billing: Payments, invoices, refunds
technical: Bugs, outages, integrations
sales: Pricing, plans, upgrades
```

Options and Levels also accept an expression that returns an array, or for Choice, an `{ option: description }` object.

To use the API's full question format, including JSON objects as instructions or criteria, set **Define Questions** to *Using JSON* and paste a `questions` map from the [API reference](https://docs.typesafe.ai/api).

**Output** (default, with *Simplify Output* on):

```json
{
  "message": "I was charged twice for order A-104. Please refund the duplicate.",
  "jev": {
    "department": "billing",
    "department_confidence": 0.93,
    "frustration": 1.1,
    "frustration_level": "Frustrated but civil",
    "frustration_confidence": 0.84,
    "is_urgent": 0.21,
    "_model": "jev-1.13.0"
  }
}
```

| Answer Type | Fields written |
| --- | --- |
| Choice | `<id>` (the chosen option), `<id>_confidence` |
| Score | `<id>` (the weighted score), `<id>_level` (the most likely level's text), `<id>_confidence` |
| Noul | `<id>` (the probability of yes) |

`_model` is the version that answered. Turn off **Simplify Output** to get the full API response, including every probability and token usage.

### Route by Choice

1. **Instructions**: what to decide, e.g. *Which team should handle this ticket?*
2. **Routes**: at least two. Each route's **Name** becomes an output. **Use When** describes what belongs there. Names can't be expressions, because they define the outputs.
3. **Low Confidence Handling**:
   - *Send to Low Confidence Output* (default) adds a last output for items whose confidence is below the **Confidence Threshold** (default 0.5).
   - *Send to Best Route Anyway* doesn't add the extra output.

Each item leaves through one output and carries:

```json
"jev": {
  "route": "technical",
  "confidence": 0.94,
  "lowConfidence": false,
  "probabilities": { "billing": 0.03, "technical": 0.96, "sales": 0.01 },
  "_model": "jev-1.13.0"
}
```

### Options

| Option | Default | Description |
| --- | --- | --- |
| Include Input Fields | on | Keep the incoming item's fields next to the answers |
| Output Field | `jev` | Field the answers are written to |
| Simplify Output | on | Flat fields instead of the raw response (Ask Questions only) |
| Max Retries | 3 | Retries when TypeSafe returns `429` (rate limited) or `529` (overloaded), with exponential backoff that honors `retry-after` |
| Timeout (ms) | 60000 | How long to wait for a response |

### As an AI Agent tool

The node can also be used as a tool: it appears as **Jev Tool** in an AI Agent's tool list. It's useful when you want the agent to get a structured decision, such as a policy check or a classification, instead of reasoning about it in free text.

## Example workflows

Import these from [`examples/`](examples) with **Workflows → Import from File**, then pick your Jev credential on the Jev node.

| Workflow | Shows |
| --- | --- |
| [Support ticket triage](examples/support-ticket-triage.json) | Ask Questions with Choice, Score, and Noul together; an IF node escalates urgent or angry tickets |
| [Route tickets by team](examples/route-tickets-by-team.json) | Route by Choice with three team outputs and a Low Confidence output for human review |
| [Message guardrail](examples/message-guardrail.json) | JSON questions, the whole input item as state, and a Code node that decides pass, review, or block |

## Writing good questions

Most of this comes from TypeSafe's notes on [known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

- **One decision per question.** Ask *is it urgent?* and *which team?* separately, not *is it an urgent billing issue?* Extra questions in the same request cost little.
- **Say exactly what you mean.** Jev reads instructions literally. Put borderline cases in the option descriptions, e.g. `billing: Payments and refunds, including disputed charges`.
- **Make options that don't overlap,** and add an `other` option when inputs can fall outside your set.
- **Keep numbers and dates in the workflow.** Ask Jev to find or classify the value, then compare it in an IF or Code node.
- **Send only what the question needs.** Long state full of unrelated detail lowers accuracy.
- **Set thresholds by risk.** A wrong route to the sales queue costs little. A wrong refund approval costs more, so gate it at a higher confidence.
- **Test on your own data** before relying on it, and look at the items that end up in the low-confidence path.

## Limits and costs

- **One API request per input item.** Items are processed one after another. For large batches, use n8n's **Loop Over Items** node to control the pace.
- **Context:** up to 64k tokens per request, of which the state plus the longest question can use 32k.
- **Rate limits and pricing** are set by TypeSafe and billed per input token. Check the [Models](https://docs.typesafe.ai/models) page for current numbers. The node retries rate-limited requests automatically.
- **Text only.** State must be a string, a JSON object, or an array.

## Development

```bash
npm install
npm run dev         # starts n8n with this node loaded and rebuilds on change
npm test            # runs the test suite
npm run typecheck   # type-checks the node and the tests
npm run build
npm run lint
```

The tests in [`test/`](test) use [Vitest](https://vitest.dev) with a stubbed n8n context and a fake API, so they need no API key or running n8n. They cover question building, output flattening, routing, retries, error handling, and the example workflows. Test files use the `.mts` extension so n8n's node linter, which applies n8n Cloud's runtime rules to `.ts` files, doesn't treat them as node code.

`npm run dev` needs Node.js 24 or newer, because it runs the latest n8n. In dev mode n8n registers the node as `CUSTOM.jev` instead of `n8n-nodes-jev.jev`. To import the example workflows into a dev instance, change the node type first:

```bash
sed 's/"n8n-nodes-jev\.jev"/"CUSTOM.jev"/' examples/route-tickets-by-team.json > /tmp/route-dev.json
```

### Releasing

Releases are published to npm by the [Publish workflow](.github/workflows/publish.yml) when a version tag is pushed. n8n requires community nodes to be published this way, with npm provenance, to be eligible for verification. Don't run `npm publish` from your machine.

1. Move the entries under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) to a new version heading and commit.
2. Bump the version. This commits the change and creates a tag such as `v0.3.0`:

   ```bash
   npm version minor -m "chore: release %s"
   ```

3. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

The workflow checks that the tag matches `package.json`, runs the type-check and tests, then lints, builds, and publishes.

Use `npm version` rather than `npm run release`: n8n's release command regenerates CHANGELOG.md from commit messages, which replaces the hand-written entries.

**One-time npm setup.** The first publish needs an npm access token saved as the `NPM_TOKEN` repository secret. Once the package exists on npm, add this repository as a [Trusted Publisher](https://docs.npmjs.com/trusted-publishers) in the package settings (workflow `publish.yml`) and delete the secret. The workflow file lists the exact steps.

## Links

- [TypeSafe documentation](https://docs.typesafe.ai) and [API reference](https://docs.typesafe.ai/api)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE.md). This helper community node is maintained by Brains of Bots and is not affiliated with TypeSafe. Jev, TypeSafe, and the TypeSafe API are products of TypeSafe; the names are used only to describe what this node connects to.
