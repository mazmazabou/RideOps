# University of Scranton — Royal Rides Beta (Requirements & Work Plan)

**Source:** Demo + discovery call, 2026-08-14 (Granola meeting `305ce816-5a27-455f-bad8-52ece3752e9a`)
**Attendees:** Kathy Sanderson (Parking & Transportation Coordinator, 26 years in role), Tyler Zepp (Lieutenant, Student Officer Program — senior, primary user, tyler.zepp@scranton.edu). Lauren Dunleavy did not attend.

## Outcome

- **Deal: free beta for the full fall semester.** They report bugs/edge cases; annual subscription discussed after. Bug fixes are free; net-new feature work the owner stated would be chargeable.
- **Timeline:** Royal Rides season starts **Sept 4** (Tyler's Google Form stopgap covers the start). Target go-live **end of Sept / early Oct**; hard useful date is **Oct 16** (first run after fall break). SSO coordination with university IT may push the timeline.
- **Follow-ups:** Kathy available next week or early the week after, then swamped with parking permits. Tyler is the working liaison — coordinate requirements directly with him, CC Kathy. Send updated demo link + schedule a re-demo once bugs are fixed. Demo credentials (demo123 accounts) were shared in the meeting chat.

## Their Operation (Royal Rides)

- Late-night **safe-ride shuttle**, Friday + Saturday nights, **10 PM – 3 AM**, through the semester. Runs under the University Police department.
- **4 transit vans**, max **8 passengers** each. Each van has a **driver + navigator**; the navigator works a **dedicated iPhone** (mobile view confirmed working live — Tyler logged in as Morgan and approved of it).
- **Jurisdiction zones:** campus, hill section, downtown Scranton. Pickups/dropoffs must be within zones — mostly **off-campus street addresses** (apartments, bars).
- **No office dispatcher at night.** All requests must land on one queue that the **navigator sees and self-claims** — no third person assigning rides. (Driver self-claim exists in RideOps; the demo of it failed only because of the time zone bug.)
- **Rides get combined:** e.g., a 3-person and a 4-person request going the same direction ride together. Requests include a **rider count**.
- Clock in/out **not needed** (they check in with the police desk dispatcher). Shift/tardiness tracking optional at best.
- Recurring rides **not needed for Royal Rides**, but Kathy flagged a second use case: **weekday medical transports** (injured students, dorm → class) where recurring fits perfectly.
- Kathy's must-have: **exportable ridership data** (Excel) — currently manual reporting.
- Previous in-house university app was deprecated (build platform discontinued); auth broke and it crashed at 10 PM–3 AM with no IT support. Tyler's stopgap is a Google Form → spreadsheet → HTML page.

## Bugs (fix first — these sank the demo)

1. **Time zone bug (root cause of nearly everything):** server/service-hours logic assumes East Coast; the demo was presented from Pacific time. Symptoms during the demo: requested times displayed wrong (12:30 PM showed as 5:30 AM), false "requested time outside service hours" rejections, driver self-claim couldn't be shown, ride edit blocked. **Fix: per-tenant time zone setting** applied to service-hours validation and all time display, then re-test the full flow end-to-end on `/scranton`.
2. Sweep every flow that failed or looked off during the demo after the TZ fix: booking → approve → claim → on-the-way → here → boarded, ride edit, driver self-claim.
3. **Service window crosses midnight:** their hours are 10 PM–3 AM. Current `service_hours_start`/`service_hours_end` model assumes start < end within one day, and `operating_days` can't express "Friday 10 PM through Saturday 3 AM." This will falsely reject 12 AM–3 AM requests — treat as part of the bug pass, it's a launch blocker for them.
4. Also floated: **per-day service hours** (Fri/Sat differing from weekdays) as a settings enhancement.

## Custom Features (scoped in the meeting)

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Google Maps address autocomplete** for pickup/dropoff | Replaces static location list for Scranton — off-campus ops make the campus-locations model a poor fit. Autocomplete chosen over free text to keep analytics clean ("Backyard" vs "Backyard Ale House" problem was explicitly discussed). |
| 2 | **Rider count + ride combining** | Requests need a party-size field (van seats 8). Combining multiple pickups per run isn't systematized — minimum viable is rider count on the request; combining can start as navigator judgment. |
| 3 | **Service outage / office-closure toggle** | Admin sets a reason + time window; riders attempting to book see the message (inclement weather, van breakdown at 1:30 AM, ended early). Distinct from service-hours auto-deny. Kathy walked through this scenario twice — high priority for her. |
| 4 | **Van tracker embed** | They have vehicle trackers with a shareable link. Embed like the USC campus-map tab. **Both riders and navigators need it** — students want "where's the van right now." |
| 5 | **"Arrived at destination" status** | New status after boarded; currently boarding = complete. |
| 6 | **Student-facing notices/rules section** | Program rules are currently internal-only; they want a rider-visible version (also ties into #3). |
| 7 | **Scranton logo swap** | Replace golf-cart mark with the Scranton "S" seal in their tenant. Confirmed easy; current purple theme + "Royal Ride" name already approved ("fine for now"). |
| 8 | **SSO via My Scranton portal** | Required before go-live — university-members-only access. Needs meetings with their IT; the schedule risk. RideOps has no SSO/SAML today. |
| 9 | Email notification on ride denial | Mentioned as a nice-to-have alongside the outside-hours auto-deny. |

## CURRENT BACKLOG (paused 2026-08-17 — resume here)

**Everything buildable from the call has shipped** (through `347a21d`, all deployed): TZ fix + overnight windows, per-day hours (+ Royal Rides Fri/Sat 22:00–03:00 configured live), closure toggle, party size, student notices, Scranton "S" logo (per-campus logoUrl), Google Places autocomplete (key set on Railway + local .env, verified live), sanitize-html hardening, shift-calendar fixes (CSP data: font, per-day/overnight axis, per-day businessHours shading, select/eventConstraint blocking shifts outside service hours).

### Remaining items, in priority order
1. **Send the Tyler/Kathy recap email** — sitting in Gmail drafts (to tyler.zepp, CC catherine.sanderson). OWNER ACTION: switch From to hello@ride-ops.com, send. Unblocks #4 and #7.
2. **Book the re-demo** — Kathy free week of Aug 17–21 only, then parking-permit season.
3. **Beta launch readiness (dedicated Scranton instance)** — the biggest remaining chunk before real students: clone Railway project with DEMO_MODE off (currently a public demo123 password grants OFFICE access + "Switch Role" banner), own DB (fixes global-settings sharing + analytics/shift-day TZ via TENANT_TIMEZONE), fix/remove seed users (passwords reset to demo123 on every restart — `seedDefaultUsers` ON CONFLICT DO UPDATE), working SMTP (Zoho creds dead since Google Workspace migration — use Workspace SMTP or Resend), rider signup rules (Royal Card / member ID pattern). ~One evening of provisioning.
4. **SSO (My Scranton)** — needs IT contact from the recap email. ~2–4 dev days once we know CAS vs Shibboleth. THE go-live gate per Kathy; longest external lead.
5. **Van tracker embed** — blocked on Tyler sending the tracker URL; ~1 hour once received (mapUrl mechanism exists; riders need a map tab added, driver tab exists).
6. **"Arrived at destination" status** — 1–2 careful days, own session (no state machine; ~20 files incl. 43 analytics SQL literals to classify). Recommended shape: boarded → `in_transit`, arrived → `completed`.
7. **Server-side shift-hours validation** — drag/resize is now constrained client-side, but the shift popover's manual time fields and the shifts API can still create out-of-window shifts. Small.
8. **Vehicle capacity soft indicator** — vehicles.capacity + "6/8 seats" driver load + warn-but-allow on claim (see 7b below).
9. Deferred hardening: per-campus analytics SQL (moot on a dedicated instance), DST note (fall-back lands inside Royal Rides hours Sat night Oct 31→Nov 1).

**Key dates:** season starts Sept 4 (stopgap covers it); hard target **Oct 16** (first run after fall break).

## Feasibility Assessment (2026-08-16, verified against codebase)

Effort tiers: **S** = an evening, **M** = 1–2 focused days, **L** = multi-day + external dependencies. Ordered by suggested build sequence.

### 1. Rider count (party size) — **S**
No passenger concept exists anywhere. One idempotent migration (`ALTER TABLE rides ADD COLUMN party_size INT NOT NULL DEFAULT 1` appended to `runMigrations` in lib/db.js), then thread through `mapRide` (lib/helpers.js — an explicit whitelist, new columns don't flow automatically) and ~10 explicit RETURNING/SELECT column lists in routes/rides.js + driver-actions.js, a number input in booking StepWhere/StepConfirm, and display in RideStrip/RideDrawer/driver ActiveRideCard. Ride *combining* stays navigator judgment for the beta — no algorithm needed, the count on each request is what they asked for.

### 2. Service closure toggle — **S/M**
Settings infrastructure fits: `getSetting()` falls back to defaults so enforcement code works before seeding; `GET /api/settings/public/operations` is already unauthenticated and returns the whole `operations` category — a `service_closed` + `service_closed_message` key pair seeded there reaches the rider app through the existing `useOpsConfig` hook. Enforcement = one check in `POST /api/rides` returning the admin's message. Rider banner mirrors the existing 21-line `TerminationBanner` (rider/App.jsx already has the slot above the booking panel). Gotchas found: `PUT /api/settings` only UPDATEs existing rows (never inserts) so the keys must be seeded first, and `BusinessRulesSubPanel` is a hardcoded card layout with a hardcoded 8-key save array — the office UI needs explicit edits, nothing auto-appears.

### 3. Scranton logo swap — **S**
No per-campus logo mechanism exists — `/logoWithoutBackground.png` is hardcoded in the React sidebar, login.html, signup.html, and OG tags. Add a `logoUrl` field to campus-configs + DEFAULT_TENANT, wire the Sidebar img and the login/signup pages (including the synchronous FOUC script + `public/campus-themes.js`, which duplicates campus config client-side — must stay in sync or the login page flashes the wrong logo). Need the Scranton "S" seal as an asset from Tyler/Kathy (and their OK to use the university mark).

### 4. Van tracker embed — **S** (risk: external)
The whole mechanism exists: per-campus `mapUrl`/`mapEmbeddable`/`mapTitle` → iframe MapPanel, already shared by office and driver (driver's map tab shows unconditionally; deferred-mount pattern in place). Scranton is currently `mapEmbeddable: false`. Work: set their tracker link as `mapUrl`, and add a rider map tab — the rider app has exactly 3 tabs (BottomTabs TABS array + a tab-panel div in rider/App.jsx) and is already wrapped in TenantProvider, so the driver MapPanel is directly reusable. **Risk:** if their tracker provider sends `X-Frame-Options: DENY` the iframe is dead — the existing external-link fallback covers it, but test with their real link before promising the embedded version.

### 5. Student-facing notices/rules — **S/M**
`program_content` is a single-row (`id='default'`), single-column (`rules_html`) table; `GET /api/program-rules` is already fully public and the office Quill editor + server-side sanitizer (script/onclick/javascript: stripping) exist. Add a `student_rules_html` column (or `id='student'` row), a second editor sub-tab in the office Guidelines panel, and a rider-side surface (info button → modal). Rendering office-authored HTML in the rider app rides on the existing sanitizer — acceptable for office-only authors.

### 6. Google Maps address autocomplete — **M**
Surprise finding: the server never validates pickup/dropoff against the locations list — all three write paths insert free text already, so **no server change is needed to accept addresses**. The work is client-side: Places Autocomplete on StepWhere (session-token pattern), biased/restricted to the Scranton area, hybrid with the 25 campus locations (campus buildings ranked first, addresses after). Needs a Google Cloud billing account + API key with referrer restrictions — ~$0 at Royal Rides volume (Autocomplete has monthly free credit), but it's a new external account to own. Analytics hotspots keep working because Google returns standardized formatted addresses (solves the "Backyard vs Backyard Ale House" problem they raised). Jurisdiction-zone enforcement (campus/hill/downtown polygons) is possible later via place geometry — don't scope it into the beta.

### 7. "Arrived at destination" status — **M** (the deceptively big one)
There is **no state machine** — statuses are scattered string literals with no DB constraint and no server-side constants module. `driver_arrived_grace` appears in ~20 non-legacy files; routes/analytics.js alone has 43 hardcoded `'completed'` literals in inline SQL, each needing a case-by-case active/terminal decision for the new status. Realistic touch list is 15–20 files (driver-actions transition + new button, rides.js allowlists, status.js labels, badge CSS, dispatch/rides/driver components, analytics queries). Recommend modeling it as: "Rider boarded" → new `in_transit` status, "Arrived at destination" → `completed` — same touch count but cleaner semantics than a post-completion status. Do this one carefully with the full test suite; budget 1–2 focused days.

### 0a. ~~Rider count (party size)~~, ~~Service closure toggle~~, ~~Student-facing notices~~ — **SHIPPED 2026-08-17** (`151039f`)
All three S-tier items: `party_size` column + booking "Riders" selector + dispatch/driver/office displays; `service_closed`/`service_closed_message` settings with Business Rules card, rider banner, and rider-request denial (office can still create); `student_rules_html` with second Quill editor in Guidelines and a rider info-button modal. 3 API tests. Remaining backlog: Maps autocomplete (needs Google API key), logo swap (needs "S" seal asset), van tracker (needs their link), arrived-at-destination status (1-2 days), SSO (needs IT).

### 0b. ~~Per-day service hours~~ — **SHIPPED 2026-08-16** (`a6abee0`)
`service_hours_overrides` setting (JSON keyed 0=Mon..6=Sun) + "Custom Hours Per Day" editor in Settings → Business Rules. Kathy can now configure Fri+Sat 22:00–03:00 directly. Validation, recurring rides, booking UI, dispatch board axis, and rejection messages are all per-day aware; a read-only campus Time Zone line was added to the same card. Regression test covers the exact Royal Rides shape.

### 7b. Vehicle capacity soft indicator — **S** (backlog, per owner 2026-08-17)
Party sizes are informational today: a navigator can claim 3+5+4=12 into an 8-seat van with no warning. Planned: `vehicles.capacity` column (van=8, cart=3-4), running "6/8 seats" load on the driver app summed across active rides, and a warn-but-allow prompt when a claim would exceed capacity. Deliberately NOT a hard block — navigators combine with judgment and a hard stop at 2 AM is the wrong failure mode. Also add capacity to Fleet vehicle cards/drawer.

### 8. My Scranton SSO — **L** (the long pole, start the IT conversation NOW)
Architecture is friendlier than feared: all auth guards are password-agnostic (they key off session userId/role), so an IdP callback route that provisions/looks-up the user, calls `setSessionFromUser`, and sets `req.session.campus` slots in cleanly. Real work: find out what My Scranton speaks (university portals are usually CAS or SAML/Shibboleth — ask IT for metadata), add an `external_id` column + provisioning logic (default new SSO users to `rider`; office/driver accounts stay locally provisioned), pick `passport-saml`/CAS client, and handle the callback-sets-no-campus gap (`req.session.campus` is currently set only by the org-slug page routes — an IdP callback bypasses them, which would silently break timezone/locations/theming; must set it explicitly). `users.password_hash` is NOT NULL so SSO users need a placeholder. Recommend **hybrid auth for the beta**: SSO for riders, local login for staff — keeps the password endpoints and admin provisioning untouched. Dev effort ~2–4 days; the schedule risk is entirely IT coordination latency, which is why it can slip Oct 16.

### 9. Email on auto-denied requests — **S** (mostly exists)
`rider_ride_denied` notification type + office-denial emails already exist. Auto-denied requests (outside hours/closure) return an immediate error in the UI without creating a ride row, so the rider already gets instant feedback; an email adds little. Fold into #2's closure message instead of building separately.

### Suggested sequence vs Oct 16
Week 1–2: #1 + #2 + #3 + #4 (all S — visible wins for the re-demo), start #8 IT conversation in parallel. Week 3: #6 (autocomplete). Week 4: #7 (new status) + #5. SSO lands whenever IT does; everything else works with local logins in the meantime.

## Product/Positioning Notes

- Navigator ↔ rider **call/text buttons** and **status updates** (on the way / arrived / grace timer) were confirmed strong fits — these directly answer their top pain points.
- Grace timer configurability and the ride-edit **audit log** (change notes + initials) both landed well.
- Kathy is non-technical (asked what "toggle" means) — student- and admin-facing copy should stay plain-language.
- They were deciding iPhone vs iPad for navigators; iPhone view passed live, decision resolved.
- Admin-provisioned accounts story landed well with Kathy (security): platform ships with one admin, admin creates drivers/admins, only riders self-signup — and post-SSO even that funnels through the university portal.

## Work State (updated 2026-08-16 evening — TZ fix COMMITTED as 9dec00d, full suite green)

**Status:** Timezone fix committed locally (`9dec00d`, NOT pushed — pushing auto-deploys Railway production). Full Playwright suite: 102 passed / 0 failed / 4 pre-existing skips, including 3 new timezone regression tests (per-campus validation verdicts, overnight 22:00–03:00 window with previous-day attribution, recurring rides stored as campus-tz instants). Also fixed along the way: the settings API rejected overnight windows outright ("start must be earlier than end") — now only zero-length windows are rejected. Repo cleanup done: 85 root PNGs archived to screenshots/archive-worklog/, pixel-agents repo relocated out, scaffolding dirs gitignored. Feasibility assessment below.

### Round 2 (same day): adversarial bug hunt → 14 findings → demo-critical ones fixed (suite now 103 green)

An adversarial review of the fix plus a sweep of time-sensitive code found the "today" views were still broken: dispatch + driver computed "today" in UTC/browser time, so an evening Eastern ride vanished from the board (the demo-killer class of bug, one layer deeper), and the dispatch grid rendered a negative column count with 22:00–03:00 hours. **Fixed in round 2:**
- **Service-day concept** (`client/src/utils/tz.js`): a 1 AM ride belongs to the previous day's overnight service. Dispatch fetch/filtering, driver home, and KPIs all use campus-time service days; fetch spans service day + next calendar day to catch the overnight tail.
- **Dispatch grid wraps past midnight** (axis 9 PM→4 AM for Royal Rides hours), hour cells/ride strips/shift bands/now-line all campus-time + mod-24.
- **Server date filters campus-local** (`GET /api/rides?from/to` day bounds were DB-tz midnight → UTC end-of-day mixed; now campus-tz day bounds).
- **DateChips**: campus-time "today"; overnight windows offer the day after each operating day (Sunday 1 AM = Saturday night's tail was unbookable); "Today" label no longer weekday-only.
- **Campus-less sessions hardened**: login POST now carries the campus slug (bare `/login` used to delete session campus → validation silently fell back to the server clock); stanford/ucla/uci got explicit timezones (they were falling back to server tz, displaying UTC times post-fix).
- **Recurring overnight semantics**: "Friday 1:00 AM" now means Friday *night* (instant lands Saturday calendar) instead of silently creating zero rides; recurring start/end dates insert as strings (no more off-by-one from Date serialization).
- 4th regression test: evening rides don't vanish from date-filtered lists.

**Deferred (documented, mitigated for the beta by setting `TENANT_TIMEZONE=America/New_York` on Railway — DO THIS BEFORE THE RE-DEMO):** analytics `DATE(requested_time)` groups by DB-session tz (Friday-night rides report as Saturday on a UTC server — poisons daily-volume charts + Excel export until per-campus SQL work); shift-matching/tardiness/missed-shift day rolls at 8 PM ET on a UTC server; background notification emails format times in TENANT tz. All three are correct once TENANT_TIMEZONE is set for the single-campus beta. Also noted: DST fall-back lands Sat night Oct 31→Nov 1 inside Royal Rides hours (times resolve deterministically; board shows a 5-hour night).

### Original implementation notes (for reference)

**Done (uncommitted, built successfully):** Campus timezone is now the single authority for parse → validate → store → display.
- `lib/tz.js` (new): `getZonedParts`, `zonedTimeToUtc` (Intl-based, no deps; DST-safe, verified manually incl. DST boundaries + midnight).
- `lib/helpers.js`: `resolveTimezone(campusSlug)` (campus-configs tz → TENANT.timezone fallback); `isWithinServiceHours(time, tz)` now tz-aware **and supports overnight windows** (22:00–03:00 wraps; early-morning segment attributed to previous operating day); `generateRecurringDates` rewritten as pure calendar-date walk (fixes UTC-midnight day-of-week drift); new `windowSegment`/`isOvernightWindow` exported.
- `routes/rides.js`: all 3 `isWithinServiceHours` calls + 3 notification time displays pass `resolveTimezone(req.session.campus)`.
- `routes/recurring-rides.js`: occurrences now stored as real instants via `zonedTimeToUtc` (was naive strings → interpreted in server tz = the demo's "5:30 AM" bug); pre-check is overnight-aware.
- `client/src/utils/tz.js` (new): `zonedTimeToUtcISO`, `isoToZonedInputValue`, `setDisplayTimeZone`; TenantContext calls `setDisplayTimeZone(config.timezone)` on load.
- `client/src/utils/formatters.js`: formatTime/formatDate/formatDateTime render in campus tz.
- Booking (`StepConfirm`), office New Ride (`RidesPanel`), and `RideEditModal` build instants in campus tz. **RideEditModal UTC-roundtrip bug fixed** (input was rendered from `toISOString().slice(0,16)` = UTC but saved as browser-local — open+save silently shifted ride times).
- `RideChip` now uses shared `formatTime`.

**Known remaining tz gaps (deliberate, smaller):** server.js background notification intervals (driver_upcoming_ride etc.) and `formatLocalDate`/`findTodayShift` (shift tardiness) still use global `TENANT.timezone`, not per-campus. Rider `DateChips` "today" uses browser date. Acceptable for the beta (Scranton users are in campus tz); note for multi-campus hardening.

**Next session TODO (in order):**
1. Full Playwright sweep: `DEMO_MODE=true node server.js` then `npx playwright test`. Add tz regression tests (scranton vs usc session verdicts on same instant; overnight-window accept/reject; recurring ride stored instant = 10:00 NY).
2. Fresh exploratory bug hunt beyond the demo list.
3. Feasibility assessment of the custom features table below.
4. Repo root cleanup (~60 stray PNGs, .ab-method/.simone/.tasks/context/graphify-out dirs).
5. Commit the tz fix once tests pass.

## Immediate Next Actions

1. Fix time zone handling (per-tenant TZ) + overnight service window; regression-test every demoed flow on `/scranton`.
2. Email Tyler (CC Kathy): thanks, credentials recap, bug-fix ETA, propose working session.
3. Re-demo call with Kathy + Tyler once fixed (aim for next week while Kathy is free).
4. Scope/sequence the custom feature list against the Oct 16 date; start SSO conversation with university IT early — it's the long pole.
