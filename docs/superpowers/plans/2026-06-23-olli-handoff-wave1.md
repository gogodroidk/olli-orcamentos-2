# OLLI Handoff Wave 1 Implementation Plan

> **Historical note (2026-06-26):** this plan is preserved as execution context. The repository is now a Git repository and active organization docs live in `docs/README.md`, `docs/ORGANIZATION.md`, and `docs/CODE_MAP.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the strongest parts of `C:\Users\ADMIN\Desktop\OLLI\OLLI Handoff` into the current OLLI Orçamentos app without requiring new backend infrastructure.

**Architecture:** Keep the current Expo SDK 56 / React Native app and its local SQLite + optional Supabase model. Improve the existing screens and utilities in place, using handoff assets as product reference rather than creating a separate prototype.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, TypeScript, SQLite, Supabase optional backup, Playwright QA through the iPhone Lab.

---

## Files And Responsibilities

- `src/screens/HomeScreen.tsx`: make the first screen feel like the operational OLLI cockpit from the handoff, with stronger next-stop, stalled-budget, and team-preview cards.
- `src/screens/NovoOrcamentoScreen.tsx`: add a persistent quote summary footer and make the voice entry feel embedded in the quote flow.
- `src/steps/Step4Personalizacao.tsx`: keep PDF model/color controls clear and aligned with the handoff promise.
- `src/utils/pdfGenerator.ts`: strengthen client-facing document polish while keeping OLLI discreet in the footer.
- `src/services/clienteLink.ts`: ensure public link snapshots carry enough data for the client approval page to match the PDF promise.
- `app.json`: align interface style and app metadata with the dark OLLI identity.
- `docs/superpowers/plans/2026-06-23-olli-handoff-wave1.md`: execution trail for this wave.

## Task 1: Home Operational Upgrade

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Compare the current empty and non-empty Home states**

Run: `npm run qa:web`

Expected: QA saves `qa-artifacts/qa-mobile-home.png` and confirms `homeHasQuickActions: true`.

- [ ] **Step 2: Add handoff-style operational summaries**

Add derived values for stalled budget value, approved/open counts, and a lightweight team-preview section that does not require backend data. Reuse current `orcamentos`, `proxima`, and `empresa` state.

- [ ] **Step 3: Keep empty state useful**

When there are no quotes, keep the starter card and diagnosis card. Do not show fake revenue as real revenue.

- [ ] **Step 4: Verify mobile screenshot**

Run Playwright/iPhone Lab and inspect `qa-artifacts/qa-mobile-home.png` plus a fresh iPhone Lab screenshot.

## Task 2: Wizard Closing Flow Upgrade

**Files:**
- Modify: `src/screens/NovoOrcamentoScreen.tsx`

- [ ] **Step 1: Add persistent quote summary**

Add a compact summary above the footer showing total, item count, selected customer, and current document model when present.

- [ ] **Step 2: Make the voice shortcut contextual**

Keep the header `Voz` action, but make its label and accessibility point to filling the current quote. Do not remove manual flow.

- [ ] **Step 3: Guard small screens**

Ensure footer and summary do not overlap on 390x844 and 360px Android-style widths.

- [ ] **Step 4: Verify wizard**

Run `npm run typecheck` and Playwright through `NovoOrcamento` step 1 and step 4.

## Task 3: Client Document And Link Polish

**Files:**
- Modify: `src/utils/pdfGenerator.ts`
- Modify: `src/services/clienteLink.ts`
- Optionally modify: `src/screens/VisualizarOrcamentoScreen.tsx`

- [ ] **Step 1: Keep company-first document branding**

Verify the PDF header uses the user's company logo/name and OLLI only as a discreet footer seal.

- [ ] **Step 2: Strengthen the public snapshot**

Ensure link snapshots include model/color/approval toggles where already present on `Orcamento`, without adding a new backend dependency.

- [ ] **Step 3: Preserve safety**

Do not interpolate unescaped user text into generated HTML.

- [ ] **Step 4: Verify export path**

Run `npm run export:web` after typecheck.

## Task 4: App Identity And QA Loop

**Files:**
- Modify: `app.json`
- Read/verify: `assets/*`
- Verify: `scripts/iphone-lab.mjs`, `preview/iphone-lab.html`

- [ ] **Step 1: Align app style with dark identity**

Set Expo `userInterfaceStyle` to match the dark OLLI app identity unless Expo Doctor rejects it.

- [ ] **Step 2: Confirm handoff assets already imported**

Compare hashes and paths for icon, adaptive icon, favicon, and splash.

- [ ] **Step 3: Run full checks**

Run:

```powershell
npm run typecheck
npm run doctor
npm run qa:web
npm run export:web
```

Expected: all commands pass. Known React Native Web warnings may remain if not newly introduced.

- [ ] **Step 4: iPhone Lab final screenshot**

Open `http://127.0.0.1:8099`, select iPhone 16 Pro Max, capture Home and Novo Orçamento screenshots, and inspect for clipping/overlap.

## Self-Review

- Spec coverage: Home, wizard, PDF/link, identity, and QA are covered.
- Scope control: team live map, real traffic, automatic WhatsApp cobrança, and dashboard web are intentionally left for later waves because they require backend/integration work.
- Placeholder scan: no implementation placeholders are required to execute this wave.
- Repository note: this line is historical. The directory is now a Git repository; use the current branch/status before making changes.
