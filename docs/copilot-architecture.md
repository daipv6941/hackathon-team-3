# Copilot agent architecture

The copilot is a hierarchical supervisor over module-owned specialists and workflows. Every user request enters one top-level Mastra `Agent`, gets routed to a **domain supervisor**, which delegates to a **module specialist** or invokes a **deterministic workflow**. Writes are gated by HITL approval cards. Modules contribute specialists, cross-module reads, and workflows through a typed registry — no hand-edited supervisor wiring.

This document is the single source of truth for the copilot system's shape. When this doc and the code disagree, the doc is the bug — fix it here.

For repo-wide architecture, see [`architecture.md`](architecture.md). This file expands its [§9 Agent system](architecture.md#9-agent-system-copilot) into the operational detail you need to build, change, or debug the agent layer.

## Contents

1. [Topology](#1-topology)
2. [Domains](#2-domains)
3. [Registry contract — `@seta/copilot-sdk`](#3-registry-contract--setacopilot-sdk)
4. [Tools — write vs. read vs. cross-module](#4-tools--write-vs-read-vs-cross-module)
5. [Workflows](#5-workflows)
6. [HITL — approval card contract](#6-hitl--approval-card-contract)
7. [Retrieval — vectors via Mastra primitives](#7-retrieval--vectors-via-mastra-primitives)
8. [Runtime safety, observability, audit](#8-runtime-safety-observability-audit)
9. [Adding a module](#9-adding-a-module)
10. [Adding a workflow](#10-adding-a-workflow)
11. [Operational rules](#11-operational-rules)
12. [References](#12-references)

---

## 1. Topology

A request travels through at most three Mastra agents:

```
                        ┌────────────────────────────────┐
                        │  Top Supervisor (~4 domains)   │
                        │  Work · People · Self · Meta   │
                        └──────────────┬─────────────────┘
                                       │ delegate
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
    ┌──────────────────┐   ┌────────────────────┐   ┌────────────────────┐
    │ Work Supervisor  │   │ People Supervisor  │   │  Self Supervisor   │
    │                  │   │                    │   │                    │
    │ sub-agents:      │   │ sub-agents:        │   │ sub-agents:        │
    │  • planner       │   │  • identity        │   │  • self            │
    │  • (timesheet…)  │   │  • (hr…)           │   │                    │
    │                  │   │                    │   │ Meta Supervisor    │
    │ workflows:       │   │ workflows:         │   │  intro/capability  │
    │  • dedupOnCreate │   │  (future)          │   │  read-only         │
    │  • assignBySkill │   │                    │   │                    │
    └──────────────────┘   └────────────────────┘   └────────────────────┘
                                       │ delegate
                                       ▼
                            ┌────────────────────┐
                            │  Module specialist │
                            │  (e.g. planner)    │
                            │                    │
                            │ own tools          │
                            │ + cross-module     │
                            │   read tools       │
                            └────────────────────┘
```

**Three load-bearing rules:**

1. **Module specialists own their writes, share reads.** Writes (`requireApproval: true`) live on the owning module's specialist. Read tools that other specialists need are published to a shared cross-module read registry (RBAC-filtered, RBAC re-checked at the callee).
2. **Multi-step deterministic flows are Mastra workflows, not agent reasoning.** Dedup, skill-match, capacity-check, etc., are workflows registered on the relevant domain supervisor via `workflows: {...}`.
3. **Module-owned registration.** `@seta/copilot-sdk` exposes `registerSpecialist`, `registerCrossModuleReadTool`, `registerWorkflow`. Adding a module means dropping these calls in its `agent-tools/register.ts`. Top-supervisor and domain-supervisor prompts are **generated from the registry** — never hand-edited.

**Why 2-level, not flat:** a single supervisor over N specialists scales to N ≈ 8–10 before the routing prompt bloats and routing accuracy degrades. The hierarchy keeps each level's option set bounded as new modules (timesheet, pmo, finance, hr, …) land.

**Why specialists hold cross-module reads:** a planner question that needs timesheet capacity + identity skills should not require the supervisor to bounce between three specialists. One delegation hop, then the specialist composes reads locally.

---

## 2. Domains

The top supervisor's universe. Each domain is registered indirectly: when a module's `register.ts` calls `registerSpecialist({ domain, ... })`, that domain appears in the supervisor tree at next boot.

| Domain | Owns | Currently live |
|---|---|---|
| **Work** | planner, pmo, timesheet, milestones, deliverables | ✅ planner |
| **People** | identity, hr, org-chart, roles, permissions | ✅ identity |
| **Self** | current user's profile, prefs, notifications | ✅ self |
| **Meta** | copilot intro, system capability listing, tenant config | ✅ meta (read-only) |
| **Knowledge** | RAG over wiki/docs (deferred) | ⬜ |
| **Finance** | invoicing, budgets, expenses (deferred) | ⬜ |

**Mapping is declared by the module**, not centralized:

```ts
// packages/planner/src/backend/agent-tools/register.ts
CopilotRegistry.registerSpecialist({
  domain: 'work',
  id: 'planner',
  description: 'Manages tasks, buckets, plans, and assignments',
  instructions: () => '...',
  tools: { /* planner's tools */ },
});
```

Adding a `finance` module later → top-supervisor's routing prompt gains a `Finance` line at next boot, no other code change.

---

## 3. Registry contract — `@seta/copilot-sdk`

The SDK is the only allowed handoff between modules and the copilot engine. Modules **never** import the engine; the engine **never** imports modules. Both speak to the registry.

### 3.1 Primitives

```ts
// 1. Specialist — a Mastra sub-agent attached to a domain
CopilotRegistry.registerSpecialist({
  domain: 'work' | 'people' | 'self' | 'meta',
  id: 'planner',
  description: 'Manages tasks, buckets, plans, and assignments',
  instructions: ({ runtimeContext }) => '...',
  model: '__GATEWAY_OPENAI_MODEL_MINI__',
  tools: { plannerListMyTasks, plannerAssignTask, /* ...own tools */ },
  workflows: { /* optional: workflows owned by this specialist */ },
})

// 2. Cross-module read tool — a read another specialist may consume
CopilotRegistry.registerCrossModuleReadTool({
  id: 'timesheet_getMyCapacityThisWeek',
  description: 'Returns hours-available this week for the calling user',
  inputSchema: z.object({}),
  outputSchema: z.object({ hoursAvailable: z.number(), hoursBooked: z.number() }),
  rbac: 'timesheet:read:self',
  availableTo: 'all-specialists', // or ['planner', 'pmo']
  execute: async ({ session }) => { /* ... */ },
})

// 3. Workflow — a Mastra workflow registered as a tool on a domain supervisor
CopilotRegistry.registerWorkflow({
  domain: 'work',
  id: 'dedupOnCreate',
  description: 'Vector-search similar tasks before creating; HITL confirms',
  inputSchema: TaskDraftSchema,
  outputSchema: DedupOutputSchema,
  workflow: dedupOnCreateWorkflow,
  hitlSteps: ['confirmNotDuplicate'],
})

// 4. Standard write/read tool — unchanged pattern
defineCopilotTool({ id, name, description, input, output, rbac, needsApproval, execute })
```

### 3.2 Lifecycle

```
app boot
   │
   ├─► import "@seta/planner/agent-tools/register"    ← side-effect: register*()
   ├─► import "@seta/identity/agent-tools/register"   ← side-effect
   ├─► import "./agent-tools/register-meta"           ← side-effect
   │
   └─► initCopilotRegistry()  ─►  CopilotRegistry.freeze()
                                          │
              first request ─►  buildSupervisorTree()  ─►  cached Agent
                                          │
                                          └─►  uses snapshot of frozen registry
```

The registry is **append-only at boot, frozen at startup, read-only at request time**. Calling `register*` after freeze throws `RegistryFrozenError`. Calling `snapshot()` before freeze throws `RegistryNotFrozenError`. Boot-time order is enforced by:
- Eslint rule: `register*` only at module top-level (no dynamic calls).
- depcruise rule: modules import only via `@seta/copilot-sdk`, never each other's tools.

### 3.3 `defineCopilotTool` is a wrapper over `@mastra/core/tools.createTool`

```ts
// sdks/copilot/src/define-copilot-tool.ts
export function defineCopilotTool(spec: CopilotToolSpec) {
  return createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.input,
    outputSchema: spec.output,
    requireApproval: spec.needsApproval ?? false,  // Mastra-native key
    execute: async (ctx) => {
      await enforceRbac(spec.rbac, ctx.runtimeContext);
      const result = await spec.execute(ctx);
      await audit.write({ tool: spec.id, /* ... */ });
      return result;
    },
  });
}
```

This means approval propagates through the supervisor chain natively via Mastra's `tool-call-approval` stream event. There is **no custom approval bus**.

### 3.4 Hard invariants (CI-enforced)

| Invariant | Enforcement |
|---|---|
| Write tool sets `needsApproval: true` | `pnpm lint:rbac-coverage` (rule extension) |
| Specialist has non-empty `description` | runtime throw at `registerSpecialist` |
| Cross-module read tool has non-empty `rbac` | runtime throw at `registerCrossModuleReadTool` |
| Module imports another module's tool function | depcruise rule `no-direct-cross-module-tool-import` |
| Tool id matches `<module>_<action>` | `defineCopilotTool` constructor check |
| `register*` only at module top-level | eslint rule |

---

## 4. Tools — write vs. read vs. cross-module

Three tool categories, three behaviors:

| Category | Defined via | HITL? | Visible to |
|---|---|---|---|
| **Module write** | `defineCopilotTool({ needsApproval: true })` | yes | the owning specialist only |
| **Module read** | `defineCopilotTool()` | no | the owning specialist only |
| **Cross-module read** | `registerCrossModuleReadTool({ rbac, availableTo })` | no | every specialist allowed by `availableTo`, RBAC re-checked per call |

**Why the asymmetry on writes**: every state-changing operation belongs to one module. If two specialists could both call `planner_assignTask`, the audit trail and ownership story breaks. Reads are cheap and cross-module composition is the common case ("planner specialist needs timesheet capacity"), so reads are shared.

**Naming**: `<module>_<action>`. Examples: `planner_assignTask`, `identity_whoAmI`, `timesheet_getCapacityThisWeek`.

**RBAC**: every tool declares an `rbac` string. The wrapper calls `enforceRbac` before `execute`. The session in `requestContext` carries `effective_permissions: ReadonlySet<string>` populated by the session middleware (see `architecture.md` §8).

---

## 5. Workflows

Workflows are deterministic, replayable, auditable orchestrations registered with `registerWorkflow`. Use a workflow when:

- The job has **3+ ordered steps**.
- At least one step is a side-effect (DB write, external call).
- You want **HITL at a specific step**, not at the top.
- You want to **A/B tune** thresholds/weights without changing code.
- You want to **replay** a past run for debugging or eval.

Use a tool (and let the agent reason its way through) when the job is one operation or the ordering is genuinely free-form.

### 5.1 Anatomy

```ts
// packages/<module>/src/backend/workflows/<name>/spec.ts
export const myWorkflow = createWorkflow({
  id: 'planner.dedup-on-create',
  inputSchema, outputSchema,
})
  .then({ id: 'normalize', execute: normalizeStep })
  .then({ id: 'fetchCandidates', execute: searchStep })
  .then({ id: 'classify', execute: classifyStep })
  .then({ id: 'confirmNotDuplicate', execute: hitlStep })   // requireApproval inside
  .then({ id: 'apply', execute: applyStep })
  .commit();

export const myWorkflowSpec = {
  domain: 'work',
  id: 'dedupOnCreate',
  description: 'Vector-search similar tasks before creating; HITL confirms',
  inputSchema, outputSchema,
  workflow: myWorkflow,
  hitlSteps: ['confirmNotDuplicate'],
};
```

### 5.2 Live examples

| Workflow | Domain | Trigger | HITL step | Output |
|---|---|---|---|---|
| `dedupOnCreate` | work | every copilot-driven task creation | `confirmNotDuplicate` | `created` / `linked` (comment/related/sub-task) / `cancelled` |
| `assignBySkill` | work | chat "find someone for #142", in-chat post-create push, planner UI button | `suggestAssignee` | `assigned` / `left-unassigned` / `declined` |

### 5.3 Persistence

Workflow runs persist in `copilot.workflow_runs` (`run_id`, `workflow_id`, `tenant_id`, `started_by`, `started_via`, `input_summary`, `status`, `suspend_reason`, timestamps). Suspended runs (waiting on HITL) survive process restarts. TTL: `copilot.tenant_settings.approval_ttl_hours` (default 72h, then auto-decline).

---

## 6. HITL — approval card contract

Every write tool sets `requireApproval: true`. No inline confirmations. No out-of-band approval surfaces (no Slack, no email — in-app only in v1). The surface is the assistant-ui Interactable card rendered from the shared `ApprovalCard` schema.

### 6.1 Schema (`sdks/copilot/src/hitl/card.ts`)

```ts
type ApprovalCard = {
  toolCallId: string         // for resume
  intent: string             // human-readable "Assign task #142 to Alice"
  riskBadge: 'write' | 'destructive' | 'external'
  summary: string            // one-liner
  details: ApprovalDetailBlock[]   // typed blocks the UI knows how to render
  primary:   { label: string; argsPatch?: object }            // → approveToolCall
  alternates: Array<{ label: string; argsPatch: object }>     // → approve with modifiedArgs
  decline:   { label: string }                                // → declineToolCall
  meta: { tenantId, userId, agentPath, toolId, ts }
}

type ApprovalDetailBlock =
  | { kind: 'text'; body: string }
  | { kind: 'kvTable'; rows: Array<{ k: string; v: string }> }
  | { kind: 'candidateList'; items: CandidateRow[] }   // used by dedup + assignment
  | { kind: 'diff'; before: unknown; after: unknown }
  | { kind: 'confirmationChecklist'; items: string[] }
```

`details` is a **closed union** so the renderer stays simple — each kind has a typed React component in `apps/web/src/modules/copilot/workflows/components/`.

### 6.2 Propagation

A tool with `requireApproval` suspends regardless of how deep in the delegation chain it sits. The top supervisor's `fullStream` emits a `tool-call-approval` event with `{ toolName, args, toolCallId, runId, agentPath: ['supervisor','work','planner'] }`. The web client surfaces the card; the user's choice resumes the run via:

```ts
await topSupervisor.approveToolCall({ runId, toolCallId, modifiedArgs? })
// or
await topSupervisor.declineToolCall({ runId, toolCallId })
```

`modifiedArgs` is how alternates work — for assignment, the top suggestion is `assigneeId: aliceId`; picking Bob sends `argsPatch: { assigneeId: bobId }` and Mastra resumes with the patched args. No custom resume protocol.

### 6.3 Routing

| Trigger | Approval lands in |
|---|---|
| Chat-initiated workflow | the chat thread that triggered it |
| Workflow API (e.g. planner UI button) | a "Pending approvals" rail in the chat panel |
| Group/multi-user workflows | initiating user only (delegation deferred) |

### 6.4 Audit

Every approval, decline, modifiedArgs, and TTL expiry writes a row to `core.events` (alongside domain events — the unified audit history). Includes the full args + actor + agent path.

---

## 7. Retrieval — vectors via Mastra primitives

We do **not** hand-roll vector search. Every retrieval tool is built on Mastra's `createVectorQueryTool` against `@mastra/pg`'s `PgVector` backend.

### 7.1 What gets embedded

Embeddings are a **derived index** for fuzzy/semantic lookup only. Postgres is the source of truth. Anything that admits an exact match (IDs, enums, dates, RBAC, status flags, exact skill tags) stays in SQL.

| Source | Embedded content | Table |
|---|---|---|
| **Task** | `title \n\n description \n\n skill_tags joined` | `planner.task_embeddings` |
| **User profile** | `displayName \n\n role \n\n skills joined \n\n bio` | `identity.user_profile_embeddings` |

Tables follow the [§10 partition + HNSW pattern](architecture.md#10-embeddings-and-retrieval). Sync is event-driven via the outbox + `source_hash` change detection (idempotent, model upgrades re-embed via `model_id` filter).

### 7.2 Query pattern — always hybrid, never pure vector

```ts
const taskDedupSearch = createVectorQueryTool({
  vectorStoreName: 'pg',
  indexName: 'planner_task_embeddings',
  model: embeddingProvider,           // from @seta/shared-embeddings
  enableFilter: true,
  reranker: {
    model: '__GATEWAY_OPENAI_MODEL_MINI__',
    options: {
      weights: { semantic: 0.55, vector: 0.30, position: 0.15 },  // per-tenant tunable
      topK: 5,
    },
  },
});

await taskDedupSearch.execute({
  queryText: draft.title + '\n\n' + draft.description,
  topK: 20,
  filter: {
    tenant_id: session.tenantId,
    status: { $ne: 'archived' },
    created_at: { $gt: ninetyDaysAgoISO },
  },
});
```

The metadata filter is pushed into the same pgvector round-trip. The reranker is per-tenant tunable via `copilot.tenant_settings.dedup_weights`. We don't write our own scoring formula.

### 7.3 Relational + vector are merged in workflow code, not in the tool

For skill-match assignment, the workflow runs two parallel branches: a relational fast path (exact `skills && task.skill_tags` overlap) and a vector enrichment (`userSkillSearch`). The branches merge by `user_id`. The vector tool is a building block; the workflow is the composer.

### 7.4 Deferred RAG primitives (M3 Knowledge slice)

When the Knowledge domain lands:
- `createGraphRAGTool` over `copilot.tenant_knowledge_embeddings` for wiki/doc Q&A — **use this, don't reinvent**.
- `MDocument` + `createDocumentChunkerTool` for the ingestion pipeline — **use these, don't reinvent**.

---

## 8. Runtime safety, observability, audit

### 8.1 Delegation guards

`onDelegationStart` and `onDelegationComplete` hooks wrap every domain supervisor:

- **Depth cap**: bail past delegation depth 4 (top → domain → specialist → workflow is the sane max).
- **Loop detection**: bail if the same agent is visited twice in a single run.
- **Per-tenant max-steps budget**: bail with a structured error to the user when exceeded.

### 8.2 Observability

Per [Mastra metrics guidance](https://mastra.ai/docs/observability/metrics/overview):

| Metric | Dimensions |
|---|---|
| Latency | top supervisor / domain supervisor / specialist / workflow step / tool |
| Token cost | same dimensions, per tenant |
| Approval funnel | card-issued → approved / declined / TTL-expired, per workflow + tenant |
| Dedup quality | candidates-shown → user-action (Create new / Comment / Related / Sub-task / Cancel) |
| Assignment quality | suggestion-rank → user-pick distribution |

Traces export to OpenTelemetry; dashboards in Grafana.

### 8.3 Audit

Every write-tool approval/decline/TTL-expiry and every workflow start/complete/fail writes to `core.events` (via `withEmit`). One unified history with domain events.

### 8.4 Eval suite

Three layers (run on PR + nightly):

| Layer | What | Pass bar |
|---|---|---|
| **Tool** | unit + integration against real Postgres (testcontainers) | green |
| **Workflow** | golden-trace replays + threshold-tuning vs labeled corpus | green; dedup P≥0.90, R≥0.80 |
| **Agent** | routing evals (50 prompts) + e2e evals (20 chat flows) | routing ≥95%, e2e ≥90% |

---

## 9. Adding a module

1. Scaffold via `pnpm gen module <name>` (see [`creating-modules.md`](creating-modules.md)).
2. Build the module's domain code as usual (drizzle schema, public-surface functions, events, subscribers).
3. Author copilot tools in `packages/<name>/src/backend/agent-tools/`:
   - One file per tool (e.g. `assign-task.ts`, `get-task.ts`).
   - Each tool wraps a public-surface function. Writes set `needsApproval: true`.
4. Create `packages/<name>/src/backend/agent-tools/register.ts`:

   ```ts
   import { CopilotRegistry } from '@seta/copilot-sdk';
   import { myTool1, myTool2, myWriteTool } from './...';

   CopilotRegistry.registerSpecialist({
     domain: 'work',                       // pick from Work | People | Self | Meta
     id: '<module>',
     description: '...',                   // shown to the supervisor for routing
     instructions: () => '...',            // sub-agent's own prompt
     tools: { my_tool1: myTool1, my_tool2: myTool2, my_writeTool: myWriteTool },
   });
   ```

5. Export the side-effect entry from `package.json`:

   ```json
   "./agent-tools/register": {
     "types": "./src/backend/agent-tools/register.ts",
     "default": "./src/backend/agent-tools/register.ts"
   }
   ```

6. Add the side-effect import to `packages/copilot/src/backend/init-registry.ts`:

   ```ts
   import '@seta/<module>/agent-tools/register';
   ```

7. (If you expose reads other specialists need) call `CopilotRegistry.registerCrossModuleReadTool({...})` for each — RBAC is **required**.
8. Run `pnpm typecheck && pnpm lint && pnpm test`. The CI invariants from §3.4 will catch missing approvals, missing RBAC, naming violations, and direct cross-module tool imports.

No edit to `packages/copilot/` is needed. The supervisor tree picks up the new specialist at next boot.

---

## 10. Adding a workflow

1. Decide the domain (Work / People / Self / Meta).
2. Author shared schemas in `packages/<module>/src/backend/workflows/<name>/schemas.ts` (zod).
3. Author each step as its own file under `steps/`. Steps are plain async functions taking typed inputs, returning typed outputs.
4. Compose them in `workflow.ts` using `createWorkflow(...).then(...).commit()`.
5. Export a spec in `spec.ts`:

   ```ts
   export const myWorkflowSpec = {
     domain: 'work',
     id: 'myWorkflow',
     description: 'What this does in one sentence',
     inputSchema, outputSchema,
     workflow: myWorkflow,
     hitlSteps: ['confirmStep'],
   };
   ```

6. Register in `agent-tools/register.ts`:

   ```ts
   import { myWorkflowSpec } from '../workflows/<name>/spec';
   CopilotRegistry.registerWorkflow(myWorkflowSpec);
   ```

7. (If users trigger the workflow from outside chat — e.g. a planner UI button) call the generic `POST /api/workflows/:workflowId/run` endpoint with `{ inputData, requestContext }`. The HITL card surfaces in the chat panel via the same `tool-call-approval` stream.

---

## 11. Operational rules

- **One-shot replacements, no dual versions.** No `_v2` tool names, no transition flags, no compatibility shims. Each PR cuts over fully and deletes the predecessor.
- **HITL on every write tool — non-negotiable.** Auto-approval and bypass flags are rejected on review.
- **The bus is the outbox.** State change + event row commit in one transaction via `core.emit()` inside `withEmit`. No separate publish path.
- **No cross-schema foreign keys.** `planner.tasks.assignee_id` is `uuid` with no FK to `identity.user.id`. Consistency is event-driven.
- **No cross-module data-handle sharing.** A module never hands its Drizzle client to another. Mutation crosses the boundary only through public-surface calls (RBAC re-checked at the callee) or domain events.
- **Specialists ≤ ~15 tools.** Past that, split the module's responsibilities or extract a sub-workflow. Tool schemas live in the system prompt; overflow burns cache hits and worsens model tool selection.
- **Per-supervisor instruction budget ≈ 4 KB.** CI counts; over budget triggers a domain split.

---

## 12. References

- **Spec**: `docs/superpowers/specs/2026-05-25-supervisor-refactor-umbrella-design.md` — the design that this architecture implements.
- **Plans**:
  - `docs/superpowers/plans/2026-05-25-supervisor-refactor-pr1-foundation.md`
  - `docs/superpowers/plans/2026-05-25-supervisor-refactor-pr2-dedup.md`
  - `docs/superpowers/plans/2026-05-25-supervisor-refactor-pr3-assign.md`
- **Mastra docs**:
  - [Supervisor agents](https://mastra.ai/docs/agents/supervisor-agents)
  - [Agent approval propagation](https://mastra.ai/docs/agents/agent-approval)
  - [`createVectorQueryTool`](https://mastra.ai/reference/tools/vector-query-tool)
  - [`createGraphRAGTool`](https://mastra.ai/reference/tools/graph-rag-tool)
  - [`createTool`](https://mastra.ai/reference/tools/create-tool)
- **Mastra source**: `../mastra/` (sibling checkout) — authoritative for `@mastra/core` API names + behaviors.
- **Sibling docs**:
  - [`architecture.md`](architecture.md) — repo-wide architecture; §9 high-level overview of this system.
  - [`creating-modules.md`](creating-modules.md) — how to scaffold a new module.
