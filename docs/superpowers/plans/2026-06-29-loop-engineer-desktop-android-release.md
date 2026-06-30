# Loop Engineer Desktop + Android Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize the user's desktop around the active OLLI/Fonteia systems, preserve useful shortcuts, quarantine obsolete artifacts, verify domains/links, and produce a Samsung-installable Android APK for OLLI Orçamentos.

**Architecture:** Use a reversible cleanup first: create a curated desktop launcher folder, generate manifests, and move uncertain/obsolete artifacts into a timestamped quarantine instead of hard-deleting. Keep app changes in the `olli-orcamentos` repository and verify with Expo SDK 56 checks before building Android.

**Tech Stack:** Windows PowerShell, Expo SDK 56, React Native 0.85, EAS/Gradle Android build, Playwright QA, Markdown manifests.

---

### Task 1: Desktop Inventory And Safe Cleanup

**Files:**
- Create: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\README.md`
- Create: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\inventario-desktop.json`
- Create: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\ATALHOS.md`
- Create: `C:\Users\ADMIN\Desktop\_quarentena-olli-YYYYMMDD\MANIFESTO.md`

- [ ] Resolve `.lnk` and `.url` desktop shortcuts.
- [ ] Classify each desktop item as active, legacy, personal/unknown, or quarantine.
- [ ] Create curated shortcuts for OLLI Orçamentos, iPhone Lab, Olli WhatsApp, Fonteia/SAS, and public domains.
- [ ] Move only clearly obsolete generated artifacts to quarantine; do not permanently delete user documents or unknown files.
- [ ] Write human-readable manifests explaining every move and every kept shortcut.

### Task 2: OLLI Orçamentos QA And Critical Fixes

**Files:**
- Modify only if a verified blocker is found: `scripts/`, `preview/`, `src/`, `app.json`, `eas.json`.
- Update: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\STATUS-OLLI-ORCAMENTOS.md`

- [ ] Read official Expo SDK 56 docs before any code change.
- [ ] Run `npm run typecheck`, `npm run doctor`, `npm run qa:web`, and inspect iPhone Lab.
- [ ] Fix only blockers that prevent first-run, preview, Android build, or Samsung install.
- [ ] Record remaining warnings separately from blockers.

### Task 3: Build Android APK For Samsung

**Files:**
- Output: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\APK\*.apk`
- Update: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\APK\COMO-INSTALAR-NO-SAMSUNG.md`

- [ ] Prefer local Gradle APK build if Android toolchain exists and passes.
- [ ] If local build is blocked by missing Android SDK/JDK, use EAS `preview` profile configured with `android.buildType = apk`.
- [ ] Copy the resulting APK into the organized APK folder with a clear versioned name.
- [ ] Verify the APK file exists and record size/path.

### Task 4: Domain And Service Map

**Files:**
- Create: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\DOMINIOS-E-LINKS.md`

- [ ] Verify locally known domains and URLs from OLLI Orçamentos, Olli WhatsApp, and Fonteia.
- [ ] Check safe public HTTP status for known public URLs.
- [ ] Do not change DNS, Hostinger, Cloudflare, or Stripe production settings without a concrete target change and authentication confirmation.
- [ ] Record provider, expected purpose, current status, and next action for each domain.

### Task 5: Final Verification

**Files:**
- Update: `C:\Users\ADMIN\Desktop\OLLI - Atalhos e Sistemas\RESUMO-FINAL.md`

- [ ] Re-run app QA/build verification commands.
- [ ] Verify curated shortcuts exist and point somewhere useful.
- [ ] Verify quarantine manifest exists and contains all moved items.
- [ ] Close agents and report exact paths, URLs, APK status, and any blockers.
