# Supabase Auth Google Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave OLLI prepared for Supabase email/password, password reset redirects, Google OAuth, and login-triggered sync on Expo SDK 56.

**Architecture:** Keep the app offline-first. Add a central Supabase auth redirect/OAuth layer in `src/services/supabase.ts`, wire it into existing auth screens, and document the Supabase Console settings that require user-owned Google credentials.

**Tech Stack:** Expo SDK 56, React Native 0.85, Supabase JS 2, Expo AuthSession/WebBrowser/Linking, PowerShell/Node verification.

---

### Task 1: Readiness Verifier

**Files:**
- Create: `scripts/verify-auth-readiness.mjs`
- Modify: `package.json`

- [x] **Step 1: Write failing verifier**

Create a Node script that checks for the OAuth dependencies, Expo URL scheme, Supabase auth helper exports, reset-password redirect usage, and Google button wiring.

- [ ] **Step 2: Run verifier and confirm it fails before implementation**

Run: `node scripts/verify-auth-readiness.mjs`

Expected: FAIL because Google OAuth/deep link code is not wired yet.

### Task 2: Expo OAuth Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Expo-matched dependencies**

Run: `npx expo install expo-auth-session expo-web-browser expo-linking`

- [ ] **Step 2: Verify dependency tree**

Run: `npm ls expo-auth-session expo-web-browser expo-linking --depth=0`

Expected: all three packages installed.

### Task 3: Supabase Auth Helpers

**Files:**
- Modify: `app.json`
- Modify: `src/config.ts`
- Modify: `src/services/supabase.ts`

- [ ] **Step 1: Add Expo scheme**

Set `expo.scheme` to `olliorcamentos` so Android can return from Supabase OAuth/email links.

- [ ] **Step 2: Add auth redirect helpers**

Add `AUTH_REDIRECT_PATH`, `getAuthRedirectUrl`, `handleAuthRedirectUrl`, `signInWithGoogle`, and `resetPassword`.

- [ ] **Step 3: Keep mobile token refresh healthy**

Start/stop Supabase auto-refresh from React Native `AppState` on native platforms.

### Task 4: UI Wiring

**Files:**
- Modify: `App.tsx`
- Modify: `src/screens/EntrarScreen.tsx`
- Modify: `src/screens/ContaScreen.tsx`

- [ ] **Step 1: Handle inbound auth links globally**

Use Expo Linking in `App.tsx` to pass callback URLs to `handleAuthRedirectUrl`.

- [ ] **Step 2: Make Google button real on Entrar**

Replace `emBreve('Entrar com Google')` with `signInWithGoogle`.

- [ ] **Step 3: Add Google button to Conta**

Offer Google sign-in beside email/password when not logged in.

- [ ] **Step 4: Use redirect-aware password reset**

Replace raw `resetPasswordForEmail` calls with `resetPassword`.

### Task 5: Documentation And Console Handoff

**Files:**
- Modify: `docs/SUPABASE.md`
- Create: `supabase/migrations/20260629000000_document_expected_schema.sql`

- [ ] **Step 1: Document required console settings**

List exact redirect URLs, Google provider requirements, email/SMTP checklist, and no-secret rule.

- [ ] **Step 2: Add reproducibility schema note**

Add a SQL migration document that captures the expected public tables/RLS shape without applying destructive remote changes.

### Task 6: Verification

**Files:**
- No direct edits.

- [ ] **Step 1: Run readiness verifier**

Run: `node scripts/verify-auth-readiness.mjs`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Run Expo doctor**

Run: `npm run doctor`

- [ ] **Step 4: Run web QA**

Run: `npm run qa:web`

