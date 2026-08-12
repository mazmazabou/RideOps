# Scranton Campus Research (Task 1 output — 2026-08-11)

## Brand color
- **Primary purple: `#512D6D`** — official PMS 269 (100%), per University of Scranton Identity Procedures and Guidelines (scranton.edu/printing-services/identity-standards.pdf p.6) and confirmed on the web style guide (scranton.edu/marketing-communications/webcms/style-guide/colors.html).
- **Secondary/accent: `#EA7A59`** (orange) — web style-guide accent (official trademarked colors are purple + white only).

## Derived theme values (for campus-configs.js)
- `primaryColor: '#512D6D'` (rgb 81,45,109)
- `secondaryColor: '#EA7A59'`, `secondaryTextColor: '#512D6D'`
- `sidebarBg: '#1C1129'` (very dark purple), `sidebarText: '#A99BC4'` (muted lavender)
- `sidebarActiveBg: 'rgba(81,45,109,0.35)'`
- `headerBg: '#EBE3F2'` (light purple tint)

## Campus map
- Best URL: `https://admissions.scranton.edu/our-campus/campus-maps.shtml` (links 2-D/3-D maps, virtual tour, parking map)
- No interactive map platform found — all official maps are static PDFs. **`mapEmbeddable: false`**, link out.

## Locations (25, verified against official campus map PDF)
Coverage: library, student center/dining, academic buildings (Kania, Panuska, Leahy College of Health Sciences), recreation, residence halls, health services, admissions/admin, landmarks. Array used verbatim in `tenants/scranton-locations.js`.

## Royal Ride program — IMPORTANT demo intel
- Official page: scranton.edu/about/university-police/Transportation/RoyalRide.shtml — run by **University Police** (Transportation/Parking umbrella; Cathy Sanderson is Parking Services Coordinator, which fits that umbrella).
- Current public program: **free late-night safety shuttle van ("Royal Ride / Iggy 2"), Fri–Sat 10:00 PM–3:00 AM while school is in session**, students only (Royal Card required), requests via a "Royal Ride app" + GPS tracking portal, bounded service area near campus.
- Separate program: medical transport for temporary conditions handled by Institutional Compliance/Title IX — NOT Royal Ride.
- **Implication for Friday:** Cathy's requirements (real-time requests, dispatcher dashboard, statuses, ETAs, messaging, mobile) are for Royal Ride — which today is a *night shuttle*, not a daytime accessible program like DART. Her outreach may mean: (a) the current app is being retired/replaced (TapRide died in 2023 and killed many campus apps like it), or (b) they're expanding scope. **Top discovery question for the demo: "Walk me through what Royal Ride looks like today — what's working, what's breaking, and what triggered the search?"**
- Demo framing check: booked-ahead vs on-demand matters even more for a late-night safety shuttle (purely on-demand). The honest-fit conversation should explore whether their volume/pattern fits scheduled + same-day booking, and what "real-time" concretely means for them.
