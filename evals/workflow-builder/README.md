# Workflow-builder eval

Measures whether Aivory Aether builds workflows that are **valid in n8n** and
**do what the user asked**, against ground truth from the real n8n instance.

```
prompt ──LLM (bridge generate)──▶ plan (steps) ──generatedWorkflowToN8n()──▶ n8n JSON ──scoreWorkflow()──▶ score
         └──────── live layer ────────┘            └─────────────── offline layer ───────────────┘
```

| Piece | What it is |
|---|---|
| `node-catalog.json` | Snapshot of node types, versions, resources/operations, parameter names and required credentials from n8n 2.26.4 (561 nodes). Refresh with `extract-node-catalog.js` (instructions in its header). |
| `cases.json` | 34 golden cases (EN + ID): the prompt, a reference plan, and what must be true (`expect`). |
| `lib/workflows/eval/scorer.ts` | Deterministic checks. **Critical** (a failure means it will not import/run right): node exists, typeVersion exists, not disabled by default (`executeCommand`), valid resource/operation, known parameter names, connections valid, every node reachable, one trigger of the right kind, expected/any-of nodes, branches. Non-critical: forbidden nodes, node count, placeholder values, balanced `{{ }}`. |

## Offline layer (CI, no network)

`npx vitest run lib/workflows/eval` — every case's reference plan goes through
the same conversion the workflows page uses. It isolates **mapper** bugs.
Print the full report with `EVAL_REPORT=1`.

**Ratchet:** a case that fails today carries `knownIssue` in `cases.json`. It
must keep failing (so a fix is noticed: remove the tag) and every untagged case
must pass. A regression turns an untagged case red.

## Live layer (opt-in, costs tokens)

Sends each prompt to the real bridge `generate` op and scores what the model
produces. It isolates **prompt/LLM** quality. See the header of
`lib/workflows/eval/workflowEval.live.test.ts` for the command. Outputs go to
`results/` (gitignored); keep one file per change to compare.

## knownIssue labels (root causes, first failing check)

- `invalid-op-or-params:<node>` — the mapper emits an operation/parameter that
  does not exist in n8n (e.g. Slack `send`/`channel`, HubSpot `create`).
- `no-native-node:<node>` — no native mapping, falls back to a generic HTTP
  node with a placeholder URL.
- `trigger-not-native` — an app/manual trigger is built as a generic Webhook.
- `last-step-replaced-by-respond` — on webhook workflows the last real step is
  swapped for Respond to Webhook, dropping the actual action.
- `ai-step-misclassified` — an AI step is classified by words in its title
  ("email") instead of its `app`.

Add a case whenever a real user prompt fails; never delete a case to make a
number go up.
