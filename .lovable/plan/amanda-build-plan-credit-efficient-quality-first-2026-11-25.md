# Amanda — Build Plan (credit-efficient, quality-first)

Premium Notion-inspired AI project & research execution workspace. Built on the existing TanStack Start + Tailwind v4 + shadcn stack, with Lovable Cloud for auth/database and the Lovable AI Gateway for the AI engine.

## Credit-saving strategy

- **Few large batches, not many small ones.** Each stage below lands as one coherent set of edits, verified once.
- **One database migration** covering the entire schema (11 tables, grants, RLS, indexes, profile trigger) instead of incremental migrations.
- **Reuse shadcn/ui + existing template shell**; no duplicate components, no decorative landing page.
- **One AI provider at launch: Lovable AI** (zero-config, already available). BYOK (Gemini/OpenAI) ships as a clean provider-abstraction layer + settings UI, with per-user key storage clearly flagged (see Limitations).
- **Deterministic logic for progress/checkboxes** — AI is only called for conversation, clarification, and plan generation/evolution.
- Chat history is trimmed to recent messages + plan context per request; no whole-database context dumps.

## Architecture

- **Frontend:** TanStack Start (file routes), React 19, Tailwind v4 design tokens, shadcn/ui, Lucide, TanStack Query, react-hook-form + zod.
- **Backend:** Lovable Cloud (Supabase): email/password auth, Postgres + RLS, server functions via `createServerFn` (no Edge Functions).
- **AI:** `@lovable.dev/ai-gateway` on the server, structured JSON output validated with zod into the unified Amanda contract (`chat` | `clarification_slide` | `plan_ready`). Provider adapter interface so Gemini/OpenAI can slot in later.
- **Design:** monochrome palette from the spec (#FFFFFF/#171717/#737373/#FAFAFA/#F7F7F7/#EAEAEA, dark #111111/#1B1B1B/#303030/#A3A3A3), Instrument Serif headings + Inter body (loaded via `<link>` in root head), light default with dark toggle, no gradients/glassmorphism.

## Routes

- `/auth` — sign in/up, password recovery
- `/` — dashboard (greeting, composer, continue working, upcoming tasks, recent ideas)
- `/notes` — daily notes (autosave, search, archive, multi-select, send-to-project)
- `/projects`, `/research`, `/archive` — workspace lists
- `/w/$workspaceId` — workspace: center chat + right live execution panel (drawer on mobile)
- `/settings` — general, appearance, AI provider, account
- Search via a command palette (Cmd+K) across workspaces, notes, milestones

## Database (single migration)

`profiles`, `workspaces`, `conversations`, `messages`, `daily_notes`, `clarification_sessions`, `execution_plans`, `plan_steps`, `milestone_verifications`, `workspace_activity`, `user_ai_preferences` — with FKs, indexes, cascade behavior, `GRANT`s, and RLS so users only ever see their own rows. Auto-create profile on signup via trigger.

## Stages

**Stage 1 — Foundation:** Enable Lovable Cloud, full schema migration, auth (email/password + recovery + session persistence), design tokens + fonts, app shell (collapsible sidebar, theme toggle, mobile drawer), protected routes.

**Stage 2 — Core data UI:** Dashboard with real data + empty states, daily notes editor (autosave, search, archive, promote-to-project), workspace CRUD (create/rename/archive/delete with confirmation), projects/research/archive lists.

**Stage 3 — AI engine:** Gateway SDK setup, provider abstraction, unified zod-validated response contract, streaming chat per workspace with persisted messages, context builder (objective, plan, recent messages, notes).

**Stage 4 — Clarification + planning:** Full-width slide deck (one question per slide, 3–5 option cards, custom input, back/next, Build Plan Now, persisted sessions), dynamic question generation, structured plan generation into `execution_plans`/`plan_steps`.

**Stage 5 — Execution panel:** Live plan panel (phases, milestones, checkboxes, progress), milestone completion → Amanda verification message, reopen/note actions, intelligent plan evolution (preserve completed steps + IDs, modify pending, ask before invalidating completed work).

**Stage 6 — Polish:** Search palette, responsive/tablet/mobile passes, PWA manifest + icons, settings pages, error/loading/empty states, end-to-end verification of the spec's workflows A–G with Playwright.

## Limitations (stated honestly, per spec)

- **BYOK key storage:** Lovable Cloud secrets are project-level, not per-user. The settings UI and provider abstraction will ship; per-user encrypted key storage will be implemented only if a secure server-side path exists, otherwise the UI will clearly say the feature is unavailable rather than faking it. Lovable AI works out of the box for all users.
- **GitHub:** I can't connect a repository from chat. You'll need to connect it via Lovable's GitHub integration (project Settings → GitHub); after that, changes sync automatically. I commit every stage with meaningful messages either way.
- **Google OAuth:** needs your Google client credentials; email/password auth ships regardless.

## Verification

After each stage: build check + targeted tests for rules that matter (RLS scoping, progress calculation, plan-evolution preservation). Final pass: Playwright run of the core flows (signup → note → project → clarification → plan → milestone check-off → plan revision) before reporting done.
