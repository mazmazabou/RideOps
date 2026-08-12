---
name: scranton-demo-readiness
status: approved
created: 2026-08-12T02:03:16Z
updated: 2026-08-12T02:03:16Z
---

# Scranton Demo Readiness Package — Design

## Context

First live sales demo of RideOps: **Friday 2026-08-14, 3:00–4:00 PM ET**, Google Meet, with University of Scranton's Royal Ride program. Attendees: Catherine "Cathy" Sanderson (Parking Services Coordinator — accepted), Tyler Zepp (accepted), Lauren Dunleavy (pending).

Their stated requirements: real-time student ride requests, live student↔dispatcher messaging, dispatcher dashboard with request queue, ride status updates, ETAs, mobile app. Gaps already disclosed by Mazen in the email thread: no in-app messaging, no ETAs (RideOps is booked-ahead by design), mobile web rather than native app. The transparency earned the meeting; every deliverable keeps that tone.

Current state: no formal brand kit, no template deck, no pricing beyond "first 3 months free," no demo script.

## Decisions (made 2026-08-11)

1. **Brand:** refine the existing identity (SteelBlue `#4682B4` / Tan `#D2B48C`, RideOps name) — no rebrand.
2. **Deck tool:** Canva brand template, generated via the connected Canva MCP.
3. **Pricing:** research competitors and propose concrete tiers; Mazen approves numbers before they enter the deck.
4. **Demo environment:** add a Scranton-branded campus config and demo from production.

## Deliverables

### 1. Brand kit — `rideops-brand` skill

Location: `~/.claude/skills/rideops-brand/` (user-level skill, reusable across repos).

- **Colors:** SteelBlue `#4682B4` primary, Tan `#D2B48C` accent, neutrals and semantic status colors lifted from `public/css/rideops-theme.css`.
- **Logo:** SVG wordmark ("RideOps") + circular "RO" mark evolved from `public/favicon.svg`. Light and dark variants. Exported to PNG for Canva upload; SVG sources kept in the skill's `assets/` directory.
- **Typography:** one heading/body pairing that exists in Canva's font library (so templates render correctly there).
- **Tone guide:** direct, transparent, operational — codified from the actual Cathy email thread and marketing-site copy.
- **Boilerplate:** one-paragraph and one-sentence product descriptions, founder bio (USC transportation supervisor origin), standard disclosure language for gaps.

### 2. Canva master sales template (~13 slides)

Built as a reusable branded template in Mazen's Canva account:

1. Title
2. The problem (campus accessible transit run on radios, paper, and phone tag)
3. What RideOps is
4. How it works — rider
5. How it works — dispatcher
6. How it works — driver
7. Product screenshots
8. Multi-campus theming (your brand, your buildings)
9. **"Your requirements" mapping slide** — the per-prospect customizable core
10. Honest fit & roadmap
11. Pricing
12. Pilot & rollout plan
13. Founder story + next steps

### 3. Friday's Scranton deck (instance of the template)

Short (~10 slides) — the deck bookends a live product demo. Centerpiece is the requirements-mapping slide scoring their five asks honestly:

| Their ask | Status | Story |
|---|---|---|
| Real-time ride requests | ✅ | Booking flow + dispatch queue (booked-ahead + same-day) |
| Dispatcher dashboard | ✅ | Dispatch panel: KPIs, pending queue, per-driver board |
| Ride status updates | ✅ | Full lifecycle statuses + rider notifications |
| ETAs | ⚠️ | Booked-ahead by design; "on the way"/"arrived" + grace timer cover most of the need |
| Live messaging | ⚠️ | Notifications cover the main cases; true chat is roadmap |
| Mobile app | 🟡 | Mobile web app, add-to-home-screen |

### 4. Pricing research → approved numbers

- Research agent benchmarks TransLoc, Via, Ride Systems, DoubleMap, QRyde (per-campus / per-vehicle / per-rider models).
- Proposed structure: **free 3-month pilot → flat annual per-campus subscription.** No per-ride or per-vehicle complexity at Royal Ride's scale.
- Output: competitive summary + 2–3 candidate price points. **Numbers enter the deck only after Mazen approves.**

### 5. Scranton demo environment

Mirror the existing four-campus pattern exactly:

- `tenants/campus-configs.js`: `scranton` entry — org name "Royal Ride", University of Scranton purple (exact hex verified from scranton.edu), timezone America/New_York.
- `tenants/scranton-locations.js`: ~25 real Scranton campus buildings.
- `public/campus-themes.js`: Scranton palette for charts/dispatch/analytics.
- `lib/config.js`: add `scranton` to `VALID_ORG_SLUGS`.
- Login selector card on `/login`.
- Seeded demo data; verified locally with the existing Playwright suite plus a manual pass of the demo path.
- Deployed to production (push to `main` → Railway auto-deploy) so the demo runs from **app.ride-ops.com/scranton**. Local `DEMO_MODE` server stays ready as backup.
- Deploy lands **Wednesday**, not demo day.

### 6. Demo run-of-show + script

One-page script for the hour:

- ~5 min — intro + deck (problem, what RideOps is)
- ~25 min — live demo, Cathy's seat first: student books → dispatch queue → approve → driver claims → on-the-way/arrived/completed statuses flow back to the rider → analytics → settings/branding
- ~10 min — honest gaps + discovery: their dispatch coverage, on-demand vs. booked-ahead reality, fleet size (the questions already in the calendar invite)
- ~10 min — pricing + pilot ask
- buffer — Q&A

Fallback: fresh screenshots of every demo beat (reusing the `scripts/take-screenshots.js` infrastructure pointed at the Scranton campus) in case the live demo or network fails.

## Timeline

| Day | Work |
|---|---|
| **Tue 8/11 (today)** | Brand kit + logo; Scranton campus config started; pricing research kicked off |
| **Wed 8/12** | Canva template built; Scranton env tested + deployed to production; pricing numbers to Mazen for approval |
| **Thu 8/13** | Friday deck finalized; demo script + fallback screenshots; dry run |
| **Fri 8/14 AM** | Buffer only — nothing new ships demo day |

## Error handling / risk

- **Live demo failure:** fallback screenshot set of every beat; local DEMO_MODE server as second backup.
- **Production deploy risk:** Scranton config is additive (new slug, new files, one-line slug registration) — no changes to existing campus behavior. Deployed Wednesday with two days of soak, verified against production after deploy.
- **Pricing anchor risk:** numbers gated on Mazen's explicit approval.
- **Canva rendering drift:** template reviewed in Canva itself (not just via API) before Friday's deck is instanced from it.

## Out of scope (deliberately)

- In-app messaging, ETAs, native mobile app — gaps stay gaps; the deck sells the roadmap honestly.
- Client vault / Granola integration and any other sales-infra items beyond the brand skill.
- Marketing-site changes.
