# Scranton Demo Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything needed for Friday's (2026-08-14, 3pm ET) University of Scranton demo: Scranton-branded production environment, brand kit + logo, Canva master template, Friday's deck, approved pricing, and a demo run-of-show.

**Architecture:** The Scranton campus mirrors the existing 4-campus pattern (config entry + locations file + slug registration + palette + hardcoded slug lists in 5 HTML entry points). Brand/deck work flows through the connected Canva MCP, with logo SVGs stored in the repo so raw.githubusercontent.com URLs can feed Canva's upload-asset-from-url. Pricing research runs as web-research agents with a hard human approval gate.

**Tech Stack:** Node/Express + React 19/Vite (existing), GitHub API for commits, Canva MCP, WebSearch/WebFetch agents.

## Global Constraints

- **Local git is broken (hangs on `git status`/`git commit`; disk at 77%, 7GB free). ALL commits go through the GitHub API** (`gh api`) — never run `git add`/`git commit`/`git push`. `git log`/`git show`/`git diff <paths>` reads are OK if they respond; kill anything that hangs >15s.
- Repo: `mazmazabou/RideOps`, branch `main`. **Every push to main auto-deploys to Railway** (app.ride-ops.com). Batch related file changes into ONE tree-based commit per task (script in Task 0) to avoid deploy churn.
- Commit message format: conventional (`feat:`, `docs:`) + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- CommonJS in backend (`require`), no ES modules outside `client/`.
- Never hardcode "Scranton"/"Royal Ride" outside tenant config files — same rule as other campuses.
- Status names, business rules, and existing campus behavior must not change.
- Nothing ships to production after Thursday night. Friday is buffer only.
- Brand colors: SteelBlue `#4682B4` primary, Tan `#D2B48C` accent (RideOps identity — distinct from Scranton campus purple, which themes the demo tenant only).

---

### Task 0: Remote-commit helper (infrastructure)

**Files:**
- Create: `scripts/gh-commit.sh`

**Interfaces:**
- Produces: `bash scripts/gh-commit.sh "<commit message>" <file1> [file2 ...]` — commits the given working-tree files to `mazmazabou/RideOps@main` via GitHub's git-data API (one commit for N files). All later tasks use this instead of `git commit`.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Commit local files to GitHub main via API (bypasses broken local git).
# Usage: scripts/gh-commit.sh "message" file1 [file2 ...]
set -euo pipefail
REPO="mazmazabou/RideOps"
MSG="$1"; shift

PARENT=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
BASE_TREE=$(gh api "repos/$REPO/git/commits/$PARENT" --jq .tree.sha)

TREE_ITEMS="["
SEP=""
for f in "$@"; do
  BLOB=$(gh api "repos/$REPO/git/blobs" -X POST \
    -f content="$(base64 -i "$f")" -f encoding="base64" --jq .sha)
  TREE_ITEMS+="$SEP{\"path\":\"$f\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"$BLOB\"}"
  SEP=","
done
TREE_ITEMS+="]"

TREE=$(gh api "repos/$REPO/git/trees" -X POST \
  --input <(printf '{"base_tree":"%s","tree":%s}' "$BASE_TREE" "$TREE_ITEMS") --jq .sha)
COMMIT=$(gh api "repos/$REPO/git/commits" -X POST \
  --input <(printf '{"message":%s,"tree":"%s","parents":["%s"]}' \
    "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    "$TREE" "$PARENT")  --jq .sha)
gh api "repos/$REPO/git/refs/heads/main" -X PATCH -f sha="$COMMIT" --jq .object.sha
echo "Committed: $COMMIT"
```

- [ ] **Step 2: Make executable and test with a no-op-safe file**

Run: `chmod +x scripts/gh-commit.sh && scripts/gh-commit.sh "chore: add remote-commit helper for constrained local git

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" scripts/gh-commit.sh`
Expected: prints `Committed: <sha>`; `gh api repos/mazmazabou/RideOps/commits/main --jq .sha` returns that sha.

- [ ] **Step 3: Verify Railway redeploy triggered is harmless**

The script itself deploying is fine (scripts/ is excluded from the Railway image by `.railwayignore`, but the push still triggers a rebuild of identical code). No action needed beyond noting the Railway dashboard shows a successful deploy.

---

### Task 1: Scranton research (brand color, locations, map)

**Files:**
- Create: `docs/superpowers/plans/scranton-research.md` (scratch reference, committed for traceability)

**Interfaces:**
- Produces: verified `SCRANTON_PURPLE` hex, `headerBg`/`sidebarBg` derived tints, a JS array of ~25 `{ value, label }` campus locations, campus map URL + embeddability, and the official "Royal Ride" program description. Task 2 copies these verbatim.

- [ ] **Step 1: Verify University of Scranton brand purple**

WebFetch `https://www.scranton.edu` and search for a brand/identity page (e.g. marketing-communications style guide). Record the official primary purple hex. Provisional fallback if no official hex is published: PMS 268 ≈ `#582C83`. Record final value as `SCRANTON_PURPLE`.

- [ ] **Step 2: Gather ~25 real campus locations**

WebSearch/WebFetch the Scranton campus map (`https://www.scranton.edu/about/campus-map.shtml` or equivalent). Build the location array (slug values kebab-case, labels human-readable). Seed list to verify/extend to 25: Weinberg Memorial Library, DeNaples Center, Loyola Science Center, Brennan Hall, Hyland Hall, St. Thomas Hall, O'Hara Hall, Leahy Hall, Byron Recreation Complex, Long Center, Chapman Lake?, residence halls (Condron, Montrone, Pilarz, Redington, Nevils, Driscoll, Hafey, Gavigan, McCourt?), Estate/Gunster?, Alumni Memorial Hall, Smurfit Arts Center, Rock Hall, Parking Pavilion.

- [ ] **Step 3: Verify Royal Ride facts + map embeddability**

WebFetch the Royal Ride / Parking Services page for the program's own description (hours, purpose) — used on the requirements slide and rules array. Check whether the campus map URL loads in an iframe (X-Frame-Options) to set `mapEmbeddable` accurately; if not embeddable use `mapEmbeddable: false`.

- [ ] **Step 4: Write findings to `scranton-research.md` and commit**

Run: `scripts/gh-commit.sh "docs: Scranton campus research for demo tenant

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" docs/superpowers/plans/scranton-research.md`

---

### Task 2: Scranton backend config

**Files:**
- Create: `tenants/scranton-locations.js`
- Modify: `tenants/campus-configs.js` (append `scranton` entry before closing `};`)
- Modify: `lib/config.js:55` (`VALID_ORG_SLUGS`)
- Modify: `server.js:57` (add locations require after the `uci` line)

**Interfaces:**
- Consumes: Task 1's verified `SCRANTON_PURPLE`, locations array, map URL, Royal Ride description.
- Produces: `GET /api/tenant-config?campus=scranton` returns Royal Ride config; `allCampusLocations.scranton` serves the locations; org routes `/scranton`, `/scranton/login`, `/scranton/driver`, `/scranton/rider`, `/scranton/signup` registered (routes/pages.js iterates `VALID_ORG_SLUGS` — no change needed there).

- [ ] **Step 1: Create `tenants/scranton-locations.js`** (mirror `uci-locations.js` exactly; values from Task 1)

```js
// University of Scranton campus locations for RideOps demo
const SCRANTON_LOCATIONS = [
  { value: 'weinberg-library', label: 'Weinberg Memorial Library' },
  { value: 'denaples-center', label: 'DeNaples Center' },
  { value: 'loyola-science', label: 'Loyola Science Center' },
  // ... full ~25 entries from Task 1 research ...
];

if (typeof module !== 'undefined') {
  module.exports = SCRANTON_LOCATIONS;
}
```

- [ ] **Step 2: Add the `scranton` entry to `tenants/campus-configs.js`** (values from Task 1; sidebar/header tints derived the same way UCI's are — very dark primary for sidebarBg, light tint for headerBg)

```js
  scranton: {
    orgName: 'Royal Ride',
    orgShortName: 'Royal Ride',
    orgTagline: 'University of Scranton Campus Transportation',
    orgInitials: 'RR',
    primaryColor: '<SCRANTON_PURPLE>',
    secondaryColor: '#FFFFFF',
    secondaryTextColor: '<SCRANTON_PURPLE>',
    sidebarBg: '<very dark purple, e.g. #1A0F2E>',
    sidebarText: '<muted lavender, e.g. #A99BC4>',
    sidebarActiveBg: 'rgba(<SCRANTON_PURPLE rgb>,0.25)',
    sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)',
    headerBg: '<light purple tint, e.g. #E6DEF2>',
    mapUrl: '<Task 1 map URL>',
    mapEmbeddable: <Task 1 finding>,
    campusKey: 'scranton',
    locationsKey: 'scranton',
    timezone: 'America/New_York',
  },
```

- [ ] **Step 3: Register slug and locations**

`lib/config.js:55` → `const VALID_ORG_SLUGS = ['usc', 'stanford', 'ucla', 'uci', 'scranton'];`
`server.js` after line 57 → `try { allCampusLocations.scranton = require('./tenants/scranton-locations'); } catch {}`

- [ ] **Step 4: Verify locally**

Run: `node server.js` (needs local Postgres running) then
`curl -s 'http://localhost:3000/api/tenant-config?campus=scranton' | python3 -m json.tool | head -20`
Expected: `orgName: "Royal Ride"`, primaryColor = SCRANTON_PURPLE.
`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/scranton/login` → `200`.

- [ ] **Step 5: Commit (do NOT push yet if frontend Task 3 same-day — batch OK, or commit now; either way use the helper)**

Run: `scripts/gh-commit.sh "feat: add Scranton (Royal Ride) campus tenant config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" tenants/scranton-locations.js tenants/campus-configs.js lib/config.js server.js`

---

### Task 3: Scranton frontend touchpoints

**Files:**
- Modify: `public/campus-themes.js` (palette object ~line 45ff, `getCampusPalette` switch ~line 110, doc comment line 56)
- Modify: `public/login.html:25,28,192,288`
- Modify: `public/signup.html:25-26,112,198`
- Modify: `public/demo.html:63ff` (add campus pill)
- Modify: `client/rider.html` FOUC script, `client/driver.html:29-31`, `client/office.html:32-34`

**Interfaces:**
- Consumes: `SCRANTON_PURPLE`, campus-configs values from Task 2.
- Produces: FOUC-free Scranton theming on all entry points; `/login` selector shows a Scranton card; `getCampusPalette('scranton')` returns an 8+ color purple-family palette for charts/dispatch.

- [ ] **Step 1: Add Scranton palette to `public/campus-themes.js`**

Mirror the `uci:` block shape exactly (same keys incl. mapUrl/campusKey lines), then add a `case 'scranton':` to `getCampusPalette` returning ~8 ordered purple-family hexes (dark→light purples + white/gray accents), and extend the line-56 doc comment.

- [ ] **Step 2: Update every hardcoded slug list**

In each of `public/login.html`, `public/signup.html`, `client/rider.html`, `client/driver.html`, `client/office.html`: add `'scranton'` to the slug arrays and `scranton: 'Royal Ride'` to the titles maps. In `public/login.html` campus card array (~line 192) add `{ slug: 'scranton', name: 'Scranton', program: 'Royal Ride', color: '<SCRANTON_PURPLE>' }`. In `public/demo.html` add a Scranton campus pill matching the USC pill markup.

- [ ] **Step 3: Build the React client**

Run: `cd client && npm run build` (only if disk allows — Railway rebuilds anyway; if the local build fails on disk space, verification shifts to the deployed site in Task 4)
Expected: build succeeds; `client/dist/` updated.

- [ ] **Step 4: Verify locally in browser**

With `DEMO_MODE=true node server.js`: open `http://localhost:3000/login` (Scranton card present), `http://localhost:3000/scranton/login` (purple branding, "Royal Ride" title, no FOUC flash), log in as `office`/`demo123` → office console shows purple sidebar.

- [ ] **Step 5: Commit**

Run: `scripts/gh-commit.sh "feat: Scranton campus theming across all entry points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" public/campus-themes.js public/login.html public/signup.html public/demo.html client/rider.html client/driver.html client/office.html`

---

### Task 4: Production deploy + verification (WEDNESDAY — hard cutoff Thursday)

**Files:** none new (deploy is push-triggered by Tasks 2–3 commits)

**Interfaces:**
- Consumes: Tasks 2–3 on `main`.
- Produces: working `https://app.ride-ops.com/scranton/login` demo environment with seeded data.

- [ ] **Step 1: Watch Railway deploy**

After the Task 3 commit lands, confirm the deploy succeeds (Railway builds with `npm install && npm run build`, so client dist is rebuilt server-side — local build not required).

- [ ] **Step 2: Verify production**

`curl -s 'https://app.ride-ops.com/api/tenant-config?campus=scranton' | python3 -m json.tool | head` → Royal Ride config.
Browser: `https://app.ride-ops.com/scranton/login` → purple Royal Ride login; log in office/demo123; check dispatch, rides, analytics render with purple palette; book a test ride via `/scranton/rider` as `casey` and approve it as office to prove the full loop.

- [ ] **Step 3: Existing-campus regression spot check**

`https://app.ride-ops.com/usc/login` still USC cardinal; `/login` selector shows 5 cards; default `/login` unbranded.

- [ ] **Step 4: Run the E2E suite locally against DEMO_MODE server if disk allows**

Run: `npx playwright test tests/e2e.spec.js --reporter=line` — expected all ~99 pass (none reference scranton; this is a regression gate). If local disk makes this impossible, note it and rely on Step 2–3 manual verification.

---

### Task 5: Logo + brand assets

**Files:**
- Create: `docs/brand/rideops-logo.svg` (horizontal wordmark + mark, light bg)
- Create: `docs/brand/rideops-logo-dark.svg` (for dark backgrounds)
- Create: `docs/brand/rideops-mark.svg` (RO circle mark alone, evolved from `public/favicon.svg`)
- Create: `docs/brand/BRAND.md` (colors, fonts, tone, usage)

**Interfaces:**
- Consumes: `public/favicon.svg` (existing RO circle) as the mark's starting point.
- Produces: raw.githubusercontent.com URLs (`https://raw.githubusercontent.com/mazmazabou/RideOps/main/docs/brand/rideops-logo.svg` etc.) that Task 7 feeds to Canva's `upload-asset-from-url`; BRAND.md content that Task 6 codifies into the skill.

- [ ] **Step 1: Design the three SVGs**

Wordmark: "RideOps" set in a geometric sans (font embedded as paths or system-safe stack), "Ride" in near-black `#1A2530`, "Ops" in SteelBlue `#4682B4`, preceded by the circular mark. Mark: refined RO circle — SteelBlue disc, white "RO", subtle tan `#D2B48C` route-line motif (a rounded path with a pickup dot and destination pin hint). Dark variant: white text, same mark. Keep each SVG < 20KB, viewBox-based, no external fonts at render time (convert text to paths using any available tool, or use `font-family` with wide-safe fallbacks acceptable for Canva import).

- [ ] **Step 2: Visual check**

Write a scratch HTML page in the scratchpad embedding all three at multiple sizes on light/dark backgrounds; open with the browser MCP (or `open` locally) and confirm legibility at 32px and 600px widths.

- [ ] **Step 3: Write `docs/brand/BRAND.md`**

Sections: logo usage, color palette (primary/accent/neutrals/status colors with hexes from `rideops-theme.css`), typography pairing (heading + body chosen from Canva-available fonts, e.g. Archivo + Inter class), voice & tone (3 principles distilled from the Cathy thread: direct about fit, no sales-speak, operational vocabulary), boilerplate (one-sentence and one-paragraph descriptions, founder bio, gap-disclosure language).

- [ ] **Step 4: Commit**

Run: `scripts/gh-commit.sh "feat: RideOps brand assets — logo SVGs and brand guide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" docs/brand/rideops-logo.svg docs/brand/rideops-logo-dark.svg docs/brand/rideops-mark.svg docs/brand/BRAND.md`

---

### Task 6: `rideops-brand` skill

**Files:**
- Create: `~/.claude/skills/rideops-brand/SKILL.md`
- Create: `~/.claude/skills/rideops-brand/assets/` (copies of the three SVGs)

**Interfaces:**
- Consumes: Task 5's BRAND.md + SVGs.
- Produces: a user-level skill so any future session can generate on-brand decks/proposals/one-pagers. Not committed to the RideOps repo (user-level path); no gh-commit step.

- [ ] **Step 1: Write SKILL.md**

Frontmatter `name: rideops-brand`, `description: RideOps brand kit — colors, logo assets, typography, voice, and boilerplate for client-ready deliverables (decks, proposals, one-pagers). Use whenever producing external-facing RideOps material.` Body: the full BRAND.md content plus asset paths, the raw.githubusercontent URLs for remote use (Canva), and a "deck defaults" section (title-slide layout rules, footer format `ride-ops.com · hello@ride-ops.com`).

- [ ] **Step 2: Copy assets and verify the skill loads**

Copy the three SVGs into `assets/`. Verify by invoking the skill in-session and confirming its content matches BRAND.md.

---

### Task 7: Canva master sales template (13 slides)

**Files:** none in repo (lives in Canva)

**Interfaces:**
- Consumes: Task 5 asset URLs, Task 6 brand rules, spec slide list.
- Produces: a reusable Canva brand template named "RideOps — Sales Deck Master"; its design ID recorded in the rideops-brand SKILL.md for future instancing. Task 9 instances Friday's deck from it.

- [ ] **Step 1: Upload brand assets to Canva**

`mcp__claude_ai_Canva__upload-asset-from-url` for each raw.githubusercontent SVG URL (fall back to PNG conversion if SVG rejected).

- [ ] **Step 2: Generate the 13-slide deck**

Use `generate-design-structured` (preferred, per-slide control) with the spec's slide list: Title / Problem / What RideOps is / How it works — rider / dispatcher / driver / Screenshots / Multi-campus theming / Your-requirements mapping / Honest fit & roadmap / Pricing / Pilot & rollout / Founder story + next steps. Brand rules: SteelBlue headings, tan accents only as highlights, logo on title + closing slides, footer `ride-ops.com` on content slides. Screenshot slides use placeholder frames (real screenshots land in Task 9's instance).

- [ ] **Step 3: Review and iterate**

`read-design` + `get-design-candidates`/`export-design` (PNG) to inspect every slide; fix off-brand colors/fonts via `edit-design`. Two review passes minimum.

- [ ] **Step 4: Save as brand template and hand off**

`create-brand-template-draft` → `publish-brand-template` (if the account plan allows; otherwise keep as a master design and use `copy-design` for instancing). Record the template/design ID + share URL, add both to `~/.claude/skills/rideops-brand/SKILL.md`, and give the owner the link for a look in Canva itself (rendering check from the spec's risk list).

---

### Task 8: Pricing research → approved numbers  ⛔ APPROVAL GATE

**Files:**
- Create: `docs/brand/pricing-research.md`

**Interfaces:**
- Produces: approved pricing structure + numbers for Task 9's pricing slide. **Nothing enters any deck until the owner approves via explicit question.**

- [ ] **Step 1: Dispatch web research agents (parallel)**

Agent A: published/negotiated pricing signals for TransLoc, Ride Systems/DoubleMap, QRyde, Via (campus segment) — RFP awards, university budget line items, press, G2/Capterra. Agent B: what small colleges (<6k students, paratransit-style programs like Royal Ride: a few carts, weekday service) actually pay for dispatch software; plus adjacent anchors (TapRide historic pricing, ITS dispatch tools).

- [ ] **Step 2: Synthesize into 2–3 candidate price points**

Structure fixed by spec: free 3-month pilot → flat annual per-campus. Produce Low/Mid/High candidates with rationale (e.g., anchored against competitor per-campus figures and Royal Ride's scale), plus recommended answers for "what does it cost?" objections. Write `docs/brand/pricing-research.md` and commit via `scripts/gh-commit.sh "docs: campus transit dispatch pricing research

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" docs/brand/pricing-research.md`.

- [ ] **Step 3: Present to the owner for approval**

AskUserQuestion with the candidate numbers (labels = the price points, descriptions = rationale). The approved number — and only it — goes into decks. If none approved, iterate.

---

### Task 9: Friday's Scranton deck

**Files:** none in repo (Canva instance + exported PDF in scratchpad → emailed/kept by the owner)

**Interfaces:**
- Consumes: Task 7 template, Task 8 approved pricing, Task 4 production environment (for fresh screenshots), spec's requirements-mapping table.
- Produces: "RideOps × University of Scranton — Royal Ride" deck (~10 slides), exported PDF + PPTX, shared Canva link.

- [ ] **Step 1: Instance from the template**

`create-design-from-brand-template` (or `copy-design`) → retitle. Trim to ~10 slides: drop one how-it-works slide (merge driver into dispatcher flow) and the generic screenshots slide (real Scranton screenshots go inline).

- [ ] **Step 2: Customize the core slides**

Requirements-mapping slide: the spec's exact 6-row table (✅ real-time requests, ✅ dispatcher dashboard, ✅ status updates, ⚠️ ETAs, ⚠️ messaging, 🟡 mobile) with the honest one-line story per row. Screenshots: capture from `app.ride-ops.com/scranton` (purple Royal Ride UI) — dispatch board, rider booking, driver view, analytics. Pricing slide: approved Task 8 numbers + free 3-month pilot framing. Pilot slide: concrete rollout (week 1 setup w/ their locations+branding — point out they're already looking at it; weeks 2–12 pilot; check-ins).

- [ ] **Step 3: Review, export, deliver**

Full-slide visual review via export PNGs; then `export-design` PDF + PPTX. Give the owner the Canva link + files Thursday with time to react.

---

### Task 10: Demo run-of-show + fallback

**Files:**
- Create: `docs/brand/demo-runbook-scranton.md`
- Create: fallback screenshots in scratchpad (NOT committed — `screenshots/` is gitignored and these are demo-day insurance)

**Interfaces:**
- Consumes: Task 4 production env, Task 9 deck, spec's timing plan.
- Produces: one-page script the owner can glance at during the call + a full screenshot set of every demo beat.

- [ ] **Step 1: Write the runbook**

Timing blocks from the spec (5 intro/deck → 25 live demo → 10 gaps+discovery → 10 pricing+pilot → buffer). For the live demo: the exact click path in order (start at `/scranton/login` selector moment — "this is your program" — then rider books ride → office dispatch queue → approve → driver claims → on-my-way → arrived → grace timer → complete → status flows on rider screen → analytics tour), with login credentials per role, pre-demo checklist (test the full loop 30 min before; Meet screenshare tab ready; local DEMO_MODE server booted as backup), the three discovery questions (dispatch coverage, on-demand vs booked-ahead reality, fleet size), and honest-gap talking points matching the deck. Commit: `scripts/gh-commit.sh "docs: Scranton demo run-of-show

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" docs/brand/demo-runbook-scranton.md` — **Thursday, before the ship cutoff.**

- [ ] **Step 2: Capture fallback screenshots**

Reuse `scripts/take-screenshots.js` patterns pointed at the Scranton campus (or manual browser captures of each runbook beat) into the scratchpad; verify every beat in the runbook has a matching image.

- [ ] **Step 3: Dry run**

Walk the runbook end-to-end against production Thursday evening; fix anything that stumbles; confirm total walk time ≤ 25 min.

---

## Schedule mapping

| Day | Tasks |
|---|---|
| Tue night (now) | 0, 1, 2, start 5; kick off 8 Step 1 agents |
| Wed | 3, 4 (deploy + verify), finish 5, 6, 7; 8 synthesis → approval ask |
| Thu | 9 (deck), 10 (runbook + fallback + dry run). **Ship cutoff: Thu night** |
| Fri | Buffer + pre-demo checklist only |
