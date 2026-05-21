# CLAUDE.md — `cli`

> **Template version.** This file is the seed `CLAUDE.md` for `tetiva-dev/cli`. It is copied into the repo root via TVA-21. Once that lands, the in-repo copy is authoritative.

---

## 1. Project Purpose

The Tetiva command-line interface. A Node + TypeScript CLI distributed as `@tetiva/cli` on npm. Public OSS, Apache 2.0. Developer-facing surface: `tetiva init`, `tetiva login`, `tetiva push`, `tetiva pull`, `tetiva status`. Reaches the SaaS backend's HTTP API; vendors backend's Zod schemas as shared types (per ADR-0004).

Public repo. Single legal entity, ООО «Русское облако», copyright in the LICENSE file.

## 2. Recent state

- **2026-05-20 — Repo seeded.** Initial scaffold under TVA-21: Node 18+ target, TypeScript 5.6+ build, commander/yargs (locked in PR), Vitest. Bidirectional Linear↔GitHub mirror configured via Linear's native integration. Born with auto-merge ON.

## 3. Current operative state

- **CLI version**: `0.1.0-alpha` (pre-release until v1.0 ship).
- **Distribution**: npm package `@tetiva/cli`. `npx @tetiva/cli` works without install.
- **Target platforms**: macOS, Linux, Windows. Node 18+.
- **Backend HTTP API contract**: vendored from backend's `src/api/schemas.ts` at the matching API version. Marked in `src/api-types.ts` with a `// VENDORED FROM backend/src/api/schemas.ts @ <sha>` comment.
- **Supported file formats** (detection by extension/structure): JSON (i18next), ARB, Apple Strings, Android XML, Java Properties. Same set as backend, in lock-step.
- **Supported locales** (recognized in config): RU, EN, KZ, UZ, TR. CLI itself runs in English; localization of CLI output is post-v1.0.

## 4. Domain Conventions — shared verbatim

These are canonical from day one. Every repo's `CLAUDE.md` quotes this block verbatim.

- **Key** — the stable identifier for a translatable unit, used by the code at runtime (e.g. `login.button.submit`). Keys are owned by the codebase; they never change without a migration. **Do not say "string" when you mean "key"**.
- **String** — the localized text value for a single key in a single locale. One key has N strings, where N is the number of locales the key has been translated into.
- **Segment** — used by some TMS vendors (notably Crowdin) for the sub-unit a translator works on inside a longer string. **In this project, we do not use "segment" as a public-API term.**
- **Source locale** — the locale the codebase is authored in. Default `en-US` for OSS-facing surfaces, configurable per project.
- **Target locale** — any locale strings are translated *into* for a project.
- **Base locale** — synonym for source locale used by some i18n libraries; **prefer "source locale"** and treat "base locale" as a legacy synonym to be normalized at API boundaries.
- **Locale** — a BCP 47 tag identifying a language plus optional region and script (e.g. `ru-RU`, `kk-Cyrl-KZ`). Canonical form is IETF BCP 47 with **hyphens, not underscores**. Enforce at API boundaries; normalize on read; surface in user-facing CLI flags and docs.
- **Language** — the linguistic abstraction over locales. For UI-translation purposes the locale is almost always what you want.
- **Language tag** — synonym for "locale" in BCP 47 terminology; **prefer "locale" everywhere else**.
- **Plural category** — one of CLDR's six categories: `zero`, `one`, `two`, `few`, `many`, `other`.
- **Plural form** — the actual translated string for a given plural category. **Do not say "plural form" when you mean "plural category."**
- **Placeholder** — a slot in a source string that gets filled in at runtime. The canonical term. **Do not say "variable" or "interpolation" in user-facing copy or API names.**
- **Variable** — reserved for the actual runtime value substituted into a placeholder.
- **Translation memory (TM)** — a per-project store of previously-translated source/target pairs. **Per-customer data; subject to 152-FZ residency requirements on the production data plane in Russia.**
- **Glossary** — a curated list of source terms with required target translations. Smaller than a TM, hand-maintained.
- **Terminology base (termbase)** — synonym for glossary; **prefer "glossary"**.

## 5. Architecture Overview

```
cli/
├── src/
│   ├── commands/        # One file per top-level command
│   │   ├── init.ts
│   │   ├── login.ts
│   │   ├── push.ts
│   │   ├── pull.ts
│   │   └── status.ts
│   ├── format/          # File format detect + parse + write
│   │   ├── i18next.ts   # JSON
│   │   ├── arb.ts
│   │   ├── strings.ts   # Apple
│   │   ├── android.ts   # XML
│   │   └── properties.ts # Java
│   ├── api-client.ts    # HTTP client → backend
│   ├── api-types.ts     # VENDORED from backend/src/api/schemas.ts
│   ├── config.ts        # tetiva.config.json reader/writer
│   ├── credentials.ts   # ~/.tetiva/credentials handling
│   └── index.ts         # CLI entry
├── test/
│   ├── fixtures/        # i18next/ARB/.strings sample projects for `tetiva init`
│   ├── eval-corpus/     # Tier-1 structural eval (file-format round-trip)
│   └── unit/
├── CLAUDE.md
├── LICENSE              # Apache 2.0
├── README.md            # Public-facing — install, quickstart, links to docs
├── package.json
├── tsconfig.json
├── biome.json
└── vitest.config.ts
```

**Stack**: Node 18+ target (LTS supported), TypeScript 5.6+ for build, commander or yargs as CLI framework (locked in PR for TVA-21), Vitest test runner, Biome lint/format, pnpm package manager.

**Runtime model.** The CLI is stateless on the customer machine except for `~/.tetiva/credentials` (token) and `tetiva.config.json` (per-project config). All translation state lives in the backend.

**External service touchpoints.**

- **Backend HTTP API** at `https://api.tetiva.dev/v1/`. Bearer-token auth from `~/.tetiva/credentials`.
- **OS-level browser** for `tetiva login` (opens default browser to backend auth flow).

**152-FZ note.** The CLI itself is not subject to 152-FZ; the data plane is the backend's responsibility. The CLI handles source/target text in transit only and writes target files to the customer's local filesystem. No customer data persists in the CLI installation directory.

## 6. Verifying external service connectivity

Health-check protocol:

- **Backend HTTP API**: `tetiva status` (when authenticated) round-trips to `/v1/projects` and `/v1/jobs/recent`. For pre-auth health check during a Claude Code session, use `curl https://api.tetiva.dev/healthz` and expect 200.

No other external services for the CLI surface.

## 7. Conventions

### Vendored types

`src/api-types.ts` is **vendored** from `backend/src/api/schemas.ts`. Per ADR-0004 v1.0 starts with vendored types and migrates to a published `@tetiva/shared` package once usage patterns stabilize. Update procedure for now: copy the file from backend at the matching API version, update the SHA comment at the top, run `pnpm test`.

### Data schemas

The `tetiva.config.json` schema is owned by this repo. It is Zod-validated at every CLI command's entry. Changes to it are versioned via a top-level `version` field.

### Testing

- **Unit tests**: Vitest under `test/unit/`.
- **Tier-1 structural eval**: Vitest project at `test/eval-corpus/` covering file-format round-trip — for each supported format, a fixture is parsed, serialized, and the output must be byte-identical to the input modulo formatting normalization the format permits. Command: `pnpm run eval:tier1`. Must pass 100%.
- **End-to-end against deployed backend**: smoke fixture in `test/e2e/`. Run on demand and in nightly CI; not on every PR (cost).

### Commits & branches

- Branch name per issue: use `gitBranchName` from Linear.
- Public repo: every PR description must be in English (project lingua franca for public surfaces).

### npm publishing

- Pre-release versions on `0.x.y` track until v1.0 ship.
- `pnpm publish --access public` from a release PR with a `release/v0.x.y` branch name.
- Two-factor required for npm publish. Founder-only operation; not in the autonomous loop.

## 8. Model Routing — two distinct dimensions

This section is duplicated verbatim across all repos.

### Dimension 1 — Claude Code's own routing (development time)

- **Opus**: architecture, design phases, complex multi-file refactors, eval harness design, anything that touches reference data, anything that crosses repo boundaries.
- **Sonnet**: default for implementation. Single-issue, single-repo, single feature work.
- **Switching**: explicit per-session. Sessions do not switch mid-flight; if a Sonnet session hits a problem that needs Opus reasoning, it escalates via `needs-human`.

### Dimension 2 — the product's runtime LLM routing (product time)

This is a **product subsystem** that lives in the `backend` repo. The CLI does not make routing decisions; it sends translation requests to the backend, which routes.

**Do not conflate the two dimensions.** When discussing the CLI: dimension 2 is irrelevant; only dimension 1 applies (Sonnet for implementation, Opus for design phases).

## 9. Evaluation Discipline

**Tier applicability for this repo**: Tier-1 yes (file-format round-trip + locale-tag normalization); Tier-2 no (the CLI does not produce translations; quality is owned by backend).

### Tier 1 — Structural correctness suite (the gate)

- **Cadence**: every PR that touches file parsing, config schema, locale handling.
- **Runtime budget**: under 30 seconds (smaller surface than backend).
- **Determinism**: fully deterministic. No network calls.
- **Coverage**: file-format round-trip integrity per format, locale-tag normalization to canonical BCP 47, config schema validation, placeholder detection in source strings (read-only — the CLI doesn't translate but does report placeholder counts).
- **Regression gate**: any check that passed at HEAD now fails at PR commit; pass rate < 100%.
- **Command**: `pnpm run eval:tier1`.

### Tier 2 — Translation quality benchmark

Not applicable. Quality benchmarking lives in the `backend` repo.

### Corpus expansion ≠ regression

Adding a new file format is corpus expansion, not regression. Snapshot the baseline when a new format lands so subsequent runs compare correctly.

## 10. Task Discipline — shared verbatim

Linear is the queue. Hand-written issues are normal. Don't paper over gaps.

**Linear MCP quirks**:
- `save_comment` wants `issueId`, not `id`.
- Retry `save_project` once on failure.
- `create_document` is unreliable; fall back to `save_comment`.
- `save_initiative` not exposed; create in UI.
- Cycle creation not exposed; use `cycle:week-N` labels or create in UI.
- `icon` field on `save_project` rejects non-Linear icon names.
- `priority` is inverted: `0=None, 1=Urgent, 2=High, 3=Medium, 4=Low`.

**Issue tracking direction for this repo**: **bidirectional** Linear↔GitHub via Linear's native GitHub integration. Issue state round-trips automatically; external OSS contributors open GitHub issues, those mirror into Linear.

## 11. Things to Avoid

### Reference-data files (hard prohibition 9)

The CLI does not currently vendor CLDR or BCP 47 data; locale-tag validation uses a small inline allowlist for v1.0 (RU, EN, KZ in both scripts, UZ in both scripts, TR). When this expands to full BCP 47 validation, the registry table becomes reference data — **do not modify without an authorized task**.

### Security perimeter (auto-merge guardrail 12)

- `src/credentials.ts` — token file handling, permissions.
- `src/api-client.ts` — Authorization header construction.
- Any code that writes to or reads from `~/.tetiva/**`.

### Pre-authorized dependencies

**Runtime**: `commander` OR `yargs` (locked under TVA-21; pick one and remove the other from the list), `zod`, `chalk` (or alternative for terminal colors), `cli-progress` (or alternative for progress bars), `open` (cross-platform browser launcher for `tetiva login`).

**Dev/test**: `vitest`, `@vitest/coverage-v8`, `tsx`, `typescript`, `@biomejs/biome`, `@types/node`.

The public dependency graph is itself a product surface — keep it small. Adding deps must be explicitly authorized per issue.

### Operational footguns

- **Do not store credentials with permissive permissions.** `~/.tetiva/credentials` is `0600` on POSIX, equivalent on Windows. Verify in test.
- **Do not log tokens.** Ever. Including masked.
- **Do not store customer source/target text in CLI persistent state.** The CLI is stateless except for credentials and config.
- **Do not bypass schema validation** when reading `tetiva.config.json` — config drift across CLI versions is a real risk.
- **Do not assume the user's terminal is UTF-8.** Use the `os.locale()` aware path or fail informatively.
- **Do not break Windows compatibility silently.** CI runs on macOS, Linux, and Windows runners.
- **Do not commit `.tetiva.dev.local/` or any local debug artifacts.**

## 12. Autonomous Session Protocol

Same structure as the backend protocol. CLI-specific notes:

- **Task selection**: open Linear issues in the `cli` project with `claude-code` label. Note: this repo is bidirectional-mirror, so the same issue may appear as a GitHub issue with `@claude` mentions; treat Linear as authoritative.
- **Per-session flow**: read issue, plan as Linear comment, implement, run `pnpm run lint && pnpm run typecheck && pnpm test && pnpm run eval:tier1`, open PR, run Review Pass, auto-merge if conditions met.
- **LLM-spend ledger**: append to `.orchestration/llm-spend.jsonl` on completion.

### Hard prohibitions (1–9) — same list as backend.

### Escalation — `needs-human`

Same triggers as backend. Note CLI-specific triggers: any change to credential storage shape (file location, permissions, format) must be escalated even if the loop sees it as routine — credential storage is a security perimeter surface.

## 13. Autonomous Review and Merge — Addendum

**Auto-merge state for this repo: ON.**

### Review Pass

Fresh sub-context, full PR diff, Linear issue body + comments, design docs, this `CLAUDE.md`, independent runs of `pnpm run lint && pnpm test && pnpm run eval:tier1`. Verdict: `approve`/`concerns`/`blocked`.

### Auto-merge guardrails — same 12 as backend. Specific to CLI:

- Guardrail 12 (security perimeter) covers `src/credentials.ts`, `src/api-client.ts`, anything under `~/.tetiva/**` handling.
- Guardrail 11 (cross-repo) fires if a PR touches `backend/src/api/schemas.ts` paths — that contract change belongs to a backend PR, with a follow-up CLI vendor-update PR.

### OSS-specific consideration

This is a public repo. External contributors may open PRs. Loop sessions never auto-merge external-contributor PRs — those require human review regardless of verdict. Treat the auto-merge path as loop-internal only (PRs opened by sessions running on credentials owned by the org).

## 14. Rollback

### One-command rollback (latest merge on main)

```sh
git checkout main && git pull --ff-only && git revert HEAD --no-edit && git push origin main
```

### Verification

1. CI green on main after revert.
2. `pnpm run eval:tier1` passes at 100%.
3. `pnpm run build && node dist/index.js --version` works.

### Published-package rollback (npm)

If a bad version was published:

```sh
# Deprecate the bad version (npm doesn't allow unpublish after 72h):
npm deprecate @tetiva/cli@<bad-version> "Use <good-version> instead — known issue"

# Publish a patch with the revert:
git checkout main && pnpm version patch && pnpm publish --access public
```

### Escalation

If rollback fails or takes >10 minutes, file a `needs-human` issue. Auto-merge on this repo is reviewed; do not re-enable until the rollback path is restored.

---

_Last updated: 2026-05-21 — TVA-25: §14 `master` → `main` (5 occurrences) to match actual default branch on `tetiva-dev/cli`._

_Earlier: 2026-05-20 — initial template under TVA-21 seeding._
