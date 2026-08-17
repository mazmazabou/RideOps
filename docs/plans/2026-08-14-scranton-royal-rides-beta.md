# University of Scranton — Royal Rides Beta (Requirements & Work Plan)

**Source:** Demo + discovery call, 2026-08-14 (Granola meeting `305ce816-5a27-455f-bad8-52ece3752e9a`)
**Attendees:** Kathy Sanderson (Parking & Transportation Coordinator, 26 years in role), Tyler Zepp (Lieutenant, Student Officer Program — senior, primary user, tyler.zepp@scranton.edu). Lauren Dunleavy did not attend.

## Outcome

- **Deal: free beta for the full fall semester.** They report bugs/edge cases; annual subscription discussed after. Bug fixes are free; net-new feature work Mazen stated would be chargeable.
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

1. **Time zone bug (root cause of nearly everything):** server/service-hours logic assumes East Coast; Mazen demoed from Pacific. Symptoms during the demo: requested times displayed wrong (12:30 PM showed as 5:30 AM), false "requested time outside service hours" rejections, driver self-claim couldn't be shown, ride edit blocked. **Fix: per-tenant time zone setting** applied to service-hours validation and all time display, then re-test the full flow end-to-end on `/scranton`.
2. Sweep every flow that failed or looked off during the demo after the TZ fix: booking → approve → claim → on-the-way → here → boarded, ride edit, driver self-claim.
3. **Service window crosses midnight:** their hours are 10 PM–3 AM. Current `service_hours_start`/`service_hours_end` model assumes start < end within one day, and `operating_days` can't express "Friday 10 PM through Saturday 3 AM." This will falsely reject 12 AM–3 AM requests — treat as part of the bug pass, it's a launch blocker for them.
4. Mazen also floated **per-day service hours** (Fri/Sat differing from weekdays) as a settings enhancement.

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

## Product/Positioning Notes

- Navigator ↔ rider **call/text buttons** and **status updates** (on the way / arrived / grace timer) were confirmed strong fits — these directly answer their top pain points.
- Grace timer configurability and the ride-edit **audit log** (change notes + initials) both landed well.
- Kathy is non-technical (asked what "toggle" means) — student- and admin-facing copy should stay plain-language.
- They were deciding iPhone vs iPad for navigators; iPhone view passed live, decision resolved.
- Admin-provisioned accounts story landed well with Kathy (security): platform ships with one admin, admin creates drivers/admins, only riders self-signup — and post-SSO even that funnels through the university portal.

## Work State (updated 2026-08-16 — TZ fix implemented, tests NOT yet run)

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
