# Scranton Demo Run-of-Show — Friday 2026-08-14, 3:00–4:00 PM ET

Google Meet: meet.google.com/hvu-nfow-ejq · Attendees: Cathy Sanderson (Parking Services Coordinator), Tyler Zepp (accepted), Lauren Dunleavy (invited)

## Pre-demo checklist (2:00 PM)

- [ ] Open **app.ride-ops.com/scranton/login** in a clean browser window — verify purple Royal Ride branding loads
- [ ] Log in all three roles in separate windows/profiles: `office`, `casey` (rider), `alex` (driver) — password `demo123`
- [ ] Walk the FULL loop once: book → approve → claim → on my way → arrived → complete (leaves clean data + warms everything)
- [ ] Local backup ready: `SMTP_HOST= node server.js` running (server boot can take 1–2 min — start it early)
- [ ] Deck open in Canva (RideOps × University of Scranton — Royal Ride) + PDF as backup
- [ ] Fallback screenshots folder open (docs/brand/deck-shots/)
- [ ] Meet screenshare tested; notifications on the presenting machine silenced

## Run of show

**~5 min — Open + deck (slides 1–3)**
The problem framing: requests by phone/radio, paper logs, riders in the dark. One sentence on what RideOps is. Then: "But let me just show you — this is your program."

**~25 min — Live demo (Cathy's seat first)**
1. **The moment:** open `app.ride-ops.com/scranton/login` — Royal Ride, their purple, their name. "This is live right now, configured with your 25 campus buildings."
2. **Student view (casey):** book a ride — Weinberg Memorial Library → DeNaples Center — show the real Scranton building list, pick a time, confirm.
3. **Dispatcher view (office):** the request appears in the pending queue → Approve. Tour the board: KPIs, today's schedule per driver.
4. **Driver view (alex):** clock in → claim the ride → On My Way → I'm Here (grace countdown starts) → Complete.
5. **Back to student view:** every status change appeared live on Casey's phone screen.
6. **Reporting (office):** Analytics — volume, completion, no-shows, punctuality; export to Excel. "Your semester report writes itself."
7. Settings tour (30 seconds): service hours, grace period, strike policy — "your rules, not ours."

**~10 min — Honest fit + discovery (slides on 'The fit' + 'Where it fits')**
Walk the five asks honestly (covered / partial as in the deck). Then discovery — LISTEN more than talk:
- **"Walk me through what Royal Ride looks like today — what's working, what's breaking, what triggered the search?"** (Their public program is a Fri/Sat 10pm–3am safety shuttle with its own app; that app may be dying — TapRide-style campus apps shut down in 2023. Understanding this reframes everything.)
- How do students request rides today, and what volume?
- Who dispatches, and when? How many carts/vans?
- Booked-ahead + same-day vs. pure on-demand — what does their pattern actually need?

**~10 min — Pricing + pilot ask**
- "First three months are free — full platform, your branding, your buildings, no card, no commitment."
- After pilot: **flat annual subscription scoped to the program — no per-ride meters, unlimited riders/drivers/vehicles.** Quote after discovery.
- **If pressed for a number on the call:** "For a program Royal Ride's size, you'd be looking at about $4,800 a year — for context, the platforms built for city transit agencies start around $50k." (Research: docs/brand/pricing-research.md)
- The ask: "Can we pick a start date for the pilot?"

**Buffer — Q&A**

## If the live demo breaks

1. Switch to the local server (localhost:3000/scranton) — same everything.
2. If that fails: fallback screenshots (deck-shots folder) + the deck's screenshot pages — narrate the flow over stills.
3. Never apologize twice. "Let me show you this on the backup" and keep moving.

## Objection notes

- **"We need real on-demand/ETAs":** "Tell me about the moment a student is waiting — what do they need to know? Our arrived/on-the-way statuses with the grace countdown answer 'where's my ride' without GPS promises we can't keep on a golf cart."
- **"No native app?":** "Add to home screen — one tap, no App Store review cycles, updates instantly. For a program your size that's a feature."
- **"Messaging?":** "Notifications cover approved/on-the-way/arrived/no-show today. True two-way chat is on the roadmap — pilot feedback decides its priority."
