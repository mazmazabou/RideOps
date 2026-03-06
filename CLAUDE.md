# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
RideOps is an accessible campus transportation operations platform. It provides dispatch (office), driver, and rider interfaces for managing golf-cart rides around campus. The platform supports multi-tenant configuration with campus-specific branding, locations, color themes, and org-scoped URLs for 4 campuses (USC, Stanford, UCLA, UCI) plus a default generic mode.

## Multi-Campus System

### Supported Campuses
| Campus | Slug | Org Name | Primary Color | Locations File |
|--------|------|----------|---------------|----------------|
| Default | _(none)_ | RideOps | #4682B4 | default-locations.js (32) |
| USC | `usc` | USC DART | #990000 | usc-buildings.js (304) |
| Stanford | `stanford` | Stanford ATS | #8C1515 | stanford-locations.js (25) |
| UCLA | `ucla` | UCLA BruinAccess | #2774AE | ucla-locations.js (25) |
| UCI | `uci` | UCI AnteaterExpress | #0064A4 | uci-locations.js (25) |

### Org-Scoped URL Routing
- Routes registered for each slug: `/:slug`, `/:slug/login`, `/:slug/driver`, `/:slug/rider`, `/:slug/signup`
- `/login` (no slug) shows neutral campus selector — each card links to `/:slug/login`
- `/:slug/login` shows campus-branded login form; post-login redirects to `/:slug`, `/:slug/driver`, or `/:slug/rider` based on user role
- Session stores `campus` slug for context
- `GET /api/tenant-config?campus=usc` merges campus config with defaults
- Frontend detects campus from URL path and applies dynamic CSS vars
- Legacy routes (`/office`, `/driver`, `/rider`) still work with default branding

### Campus Themes (public/campus-themes.js)
- `CAMPUS_THEMES` object defines per-campus color palettes (8-14 hex colors each)
- `getCampusPalette(campusKey)` returns ordered color array for charts, dispatch grids, hotspot bars
- Used for chart colors, driver shift bands, and analytics visualizations

### Tenant Config Shape
See `tenants/usc-dart.json` for shape. Key fields: `orgName`, `primaryColor`, `secondaryColor`, `locationsFile`, `idFieldPattern`, `mapEmbeddable`, `rules`.

### Server-Side Campus Configs (tenants/campus-configs.js)
Defines per-campus overrides (colors, branding, map, locations, ID field, timezone, rules) merged into `/api/tenant-config`. When no campus slug is active, DEFAULT_TENANT values are used (SteelBlue RideOps branding). `mapEmbeddable: true` for all four campuses.

## Tech Stack
- **Backend:** Node.js (>=18) + Express + express-session + bcryptjs
- **Database:** PostgreSQL (via `pg` pool with connection pooling)
- **Sessions:** `connect-pg-simple` for PostgreSQL-backed session storage (auto-creates `session` table)
- **Rate Limiting:** `express-rate-limit` on auth endpoints (login 10/15min, signup 5/15min)
- **Frontend (Rider + Driver + Office):** React 19 + Vite multi-page build, built to `client/dist/`, served via `/app/` static route (backward-compat `/rider-app/` alias). Source in `client/src/rider/`, `client/src/driver/`, and `client/src/office/`
- **Frontend (Office — fully migrated):** All 8 office panels are React. Shell + Map + Profile + Settings (Phase 3a), Rides (Phase 3c), Staff & Fleet (Phase 3b), Dispatch (Phase 3d), Analytics (Phase 3e) with Chart.js v4 via react-chartjs-2 (npm) and react-grid-layout v2 (npm) for widget dashboard. Legacy vanilla JS fallback at `public/index-legacy.html` (no longer used in production)
- **Auth:** Session-based with async bcrypt password hashing. Default password: `demo123`
- **Email:** Nodemailer with optional SMTP (falls back to console logging)
- **Reports:** ExcelJS for multi-sheet .xlsx workbook generation (server-side, npm package)

## Running the Application

```bash
# Start server (port 3000 by default)
node server.js

# Build React app (rider + driver + office — required before serving)
npm run build

# Development: React rider with hot reload (port 5173, proxies API to :3000)
npm run dev:client

# Development mode with auto-restart (server only)
npx nodemon server.js

# With USC DART tenant
TENANT_FILE=tenants/usc-dart.json node server.js

# Demo mode (seeds 650+ rides on first run, skips if data exists)
DEMO_MODE=true node server.js

# Environment variables
PORT=3000                      # Server port (default: 3000)
DATABASE_URL=postgres://...    # PostgreSQL connection string (default: postgres://localhost/rideops)
TENANT_FILE=tenants/usc-dart.json  # Tenant config file path (optional)
DISABLE_RIDER_SIGNUP=true      # Disable public rider signup (default: false)
SMTP_HOST=                     # SMTP server (optional — falls back to console logging)
SESSION_SECRET=                # Required in production, random fallback in development
NODE_ENV=production            # Set for secure cookies and strict validation
```

Default login credentials (password: `demo123`):
- Office: `office`
- Drivers: `alex`, `jordan`, `taylor`, `morgan`
- Riders: `casey`, `riley`

## Marketing Screenshots

Marketing screenshots are NOT committed to git (`screenshots/` is gitignored). Regenerate them with:

```bash
# 1. Start server with demo data
DEMO_MODE=true node server.js

# 2. Prep database for marketing-quality data (clean E2E artifacts, seed realistic rides)
node scripts/prep-screenshot-data.js

# 3. Take all 72 screenshots (18 views × 4 campuses: usc, ucla, stanford, uci)
node scripts/take-screenshots.js
# Output: screenshots/{campus}-{view}-{detail}.png

# 4. If grace timer shots were skipped (server restart resets driver_arrived_grace → scheduled):
node scripts/retake-grace-timer.js
```

**Key gotcha:** Server startup recovery (`recoverStuckRides`) reverts `driver_arrived_grace` and `driver_on_the_way` rides to `scheduled`. The `retake-grace-timer.js` script handles this by advancing a scheduled ride via the driver API right before capturing the screenshot.

## Deployment

### Railway (Production)
- **URL:** https://app.ride-ops.com (custom domain) / https://rideops-app-production.up.railway.app
- **Config:** `railway.json` (health check, restart policy, Nixpacks). `buildCommand` runs `npm install && npm run build`
- **Database:** Railway PostgreSQL addon (auto-provisions DATABASE_URL). SSL required in production
- **Deploys:** Automatic on push to `main`. `.railwayignore` excludes screenshots/, docs/, tests/, scripts/
- **No TENANT_FILE needed:** Multi-campus routing handled by `campus-configs.js` + org-scoped URLs

### Marketing Site (Separate)
- **URL:** https://ride-ops.com
- **Host:** Vercel (Next.js)
- **Repo:** rideops-site (separate repository)

## Key Files

- `server.js` — Thin orchestrator (~310 lines): wires lib/ modules, builds shared ctx, registers route modules, runs startup/shutdown
- `lib/config.js` — Constants & tenant config: DEFAULT_TENANT, loadTenantConfig, NOTIFICATION_EVENT_TYPES, VALID_ORG_SLUGS, SETTING_DEFAULTS, SETTING_TYPES, MIN_PASSWORD_LENGTH
- `lib/db.js` — Database layer: createDb(pool, deps) → query, initDb, seedNotificationPreferences. Contains schema creation, migrations, all seed functions
- `lib/helpers.js` — Business logic helpers: createHelpers(pool, query, TENANT, ...) → generateId, mapRide, addRideEvent, getSetting, validators, service hours, miss counts, recurring ride helpers
- `lib/auth-middleware.js` — Auth: wrapAsync, createAuthMiddleware(query) → requireAuth/Office/Staff/Rider, createRateLimiters(isProduction)
- `routes/auth.js` — Login, logout, signup, change-password, tenant-config, client-config
- `routes/rides.js` — Ride CRUD with offset+cursor pagination, server-side filtering (status, date, search), approve/deny, cancel, bulk-delete, unassign, reassign, edit, locations
- `routes/driver-actions.js` — claim, on-the-way, here, complete, no-show, vehicle assignment
- `routes/analytics.js` — All 19 analytics API endpoints + export-report (~2,100 lines)
- `routes/admin-users.js` — Admin user management: CRUD, soft-delete, restore, reset-password, reset-miss-count, profile, search, email status
- `routes/employees.js` — Clock in/out, today-status, tardiness
- `routes/shifts.js` — Shift CRUD
- `routes/vehicles.js` — Vehicle CRUD, retire, maintenance
- `routes/notifications.js` — In-app notifications, preferences, purge, dev routes
- `routes/recurring-rides.js` — Recurring ride templates
- `routes/settings.js` — GET/PUT settings, public/operations
- `routes/profile.js` — GET/PUT /api/me
- `routes/content.js` — Program rules
- `routes/academic-terms.js` — Academic term CRUD
- `routes/pages.js` — Org-scoped routes, generic pages, demo routes, static files. Serves React rider (client/dist/) with fallback to rider-legacy.html
- `client/` — React rider app (Vite + React 19). Source in `client/src/`, builds to `client/dist/`
- `client/src/rider/App.jsx` — Rider root component: auth/tenant/toast providers, tab state, auto-switch logic
- `client/src/driver/App.jsx` — Driver root component: clock in/out, ride lifecycle, grace timer, vehicle selection
- `client/src/office/App.jsx` — Office root component: sidebar nav, panel switching, notification drawer, rules modal
- `client/src/office/components/layout/` — OfficeLayout, Sidebar, OfficeHeader, MobileWarning
- `client/src/office/components/settings/` — SettingsPanel + 6 sub-panels (Users, BusinessRules, Notifications, Guidelines, Data, AcademicTerms) + UserDrawer. Notifications sub-panel uses save-on-toggle switches (same pattern as driver/rider)
- `client/src/office/components/dispatch/` — DispatchPanel, KPIBar, PendingQueue, DispatchGrid, DriverRow, RideStrip, NowLine (5s polling, reuses RideDrawer/RideEditModal from rides/)
- `client/src/office/components/rides/` — RidesPanel + FilterBar, Toolbar, RidesTable, RideRow, Pagination, ScheduleGrid, RideChip, RideDrawer, RideEditModal
- `client/src/office/components/staff/` — StaffPanel, EmployeeBar, ShiftCalendar (FullCalendar with deferred mount, drag-to-create, right-click context menu, per-driver campus palette colors)
- `client/src/office/components/fleet/` — FleetPanel, VehicleCard, VehicleDrawer (add/retire/delete/reactivate/maintenance modals)
- `client/src/api.js` — Shared fetch wrappers for rider + driver API endpoints
- `client/src/components/booking/` — BookPanel, StepWhere, StepWhen, StepConfirm, DateChips, StepIndicator
- `client/src/components/rides/` — MyRidesPanel, HeroCard, GraceTimer
- `client/src/components/history/` — HistoryPanel, HistoryRow, RecurringSection
- `client/src/components/drawers/` — SettingsDrawer, ProfileForm, AvatarPicker, PasswordChange, NotificationDrawer
- `client/src/components/NotificationToggles.jsx` — Shared notification preference toggle UI for driver and rider views. Grouped toggles, save-on-toggle with optimistic UI. Office uses same toggle switch CSS classes but has its own component (NotifSettingsSubPanel)
- `client/src/contexts/` — AuthContext, TenantContext, ToastContext
- `client/src/hooks/` — usePolling, useRides, useLocations, useOpsConfig, useNotifications
- `public/css/rideops-theme.css` — All CSS custom properties, component styles, layout classes
- `public/campus-themes.js` — Per-campus color palettes for charts/UI (`getCampusPalette()`)
- `public/js/rideops-utils.js` — Shared UI utilities: `statusBadge()`, `showToastNew()`, `showModalNew()`, `formatTime()`, `formatDate()`
- `client/src/office/components/analytics/constants.js` — Widget registry (WIDGET_REGISTRY, WIDGET_CATEGORIES, 31 widgets, 8 categories, per-tab default layouts, WIDGET_LAYOUT_VERSION = 7, isKPI flag for headerless KPI widgets)
- `client/src/office/components/analytics/WidgetGrid.jsx` — Widget dashboard grid using react-grid-layout v2 (12-column, drag/resize/vertical-compact). WidgetCard uses React.forwardRef
- `client/src/office/components/analytics/chartSetup.js` — Chart.js component registration. Imported once in AnalyticsPanel
- `client/src/driver/` — React driver app (Vite + React 19). Builds to `client/dist/driver.html`
- Legacy files (`public/app.js`, `public/index-legacy.html`, `public/js/analytics.js`, `public/js/widget-*.js`, `public/js/chart-utils.js`) — used only by `index-legacy.html`, not loaded by React apps
- `tests/e2e.spec.js` — Comprehensive E2E/API test suite (~99 tests): auth, rides, lifecycle, recurring, vehicles, analytics, settings, UI panels, clock events, authorization, pagination, soft-delete/restore
- `tests/uat.spec.js` — User acceptance tests (4 tests): office login, rider booking flow, office approval, driver clock-in
- `public/login.html` / `signup.html` — Auth pages with org-scoped URL support. `/login` shows campus selector (no login form); `/:slug/login` shows campus-branded login form
- `public/demo.html` — Demo mode role picker with campus-specific links
- `tenants/campus-configs.js` — Server-side campus branding configs for all 4 campuses
- `tenants/usc-dart.json` — USC DART tenant configuration
- `tenants/usc-buildings.js` — 304 USC campus locations
- `tenants/stanford-locations.js` — 25 Stanford campus locations
- `tenants/ucla-locations.js` — 25 UCLA campus locations
- `tenants/uci-locations.js` — 25 UCI campus locations
- `tenants/default-locations.js` — 32 generic campus locations (default when no tenant)
- `email.js` — Email sending (nodemailer) with tenant-aware brand colors
- `notification-service.js` — Notification dispatch engine: `dispatchNotification()` sends to office staff via preferences, `sendRiderEmail()` sends directly to riders, `sendUserNotification(userId, eventType, data, queryFn)` checks any user's preferences before dispatching (used for driver + rider notifications), `setTenantConfig()` injects org branding into email templates. Includes templates for all 21 event types across office/driver/rider roles
- `demo-seed.js` — Seeds demo data: 650+ rides, 5 weeks of shifts, clock events, recurring rides, vehicles, notifications
- `public/favicon.svg` — RideOps favicon (blue circle with RO)
- `db/schema.sql` — PostgreSQL schema reference
- `docs/reference/AUDIT_REPORT.md` — Post-analytics-overhaul platform audit (2026-03-02)
- `docs/reference/SECURITY.md` — Security posture overview for university IT evaluators

## Architecture

### Backend Architecture
- **Modular structure:** `server.js` (~310 lines) is a thin orchestrator. Business logic lives in `lib/` (4 modules) and `routes/` (15 modules)
- **Shared context pattern:** Each route module exports `function(app, ctx)`. The `ctx` object bundles all shared dependencies (pool, query, helpers, middleware, constants, external modules). Route modules destructure only what they need
- **Lib modules:** `lib/config.js` (pure constants), `lib/db.js` (factory: pool → query/initDb), `lib/helpers.js` (factory: pool/query/TENANT → 21 helpers), `lib/auth-middleware.js` (factory: query → middleware)
- **Route modules (15):** auth, content, settings, profile, admin-users, pages, employees, shifts, rides, recurring-rides, driver-actions, vehicles, analytics, academic-terms, notifications
- **Route registration order matters:** specific routes before parameterized routes, pages before static files
- Org-scoped routes for `VALID_ORG_SLUGS: ['usc', 'stanford', 'ucla', 'uci']`
- `initDb()` on startup: creates tables, runs migrations, seeds users/vehicles/settings
- Async error handling: `wrapAsync()` wrapper, global error middleware returns 500 JSON
- Graceful shutdown: SIGTERM/SIGINT handlers drain connections with 15s timeout
- Role middleware: `requireAuth`, `requireOffice`, `requireStaff`, `requireRider`
- DB helpers: `query()`, `generateId()`, `addRideEvent()`, `mapRide()`, `getSetting()`
- Startup recovery: `recoverStuckRides` reverts in-progress rides to `scheduled`, resets driver `active` states

### Office Console (React — client/src/office/)
- **Built with React 19 + Vite**, served from `client/dist/office.html` via `/app/` static route. Legacy fallback at `public/index-legacy.html`
- Sidebar navigation with 8 nav items: dispatch, rides, staff, fleet, analytics, map, settings, profile
- **All 8 panels fully migrated:** Map + Profile + Settings (Phase 3a), Rides (Phase 3c), Staff & Shifts + Fleet (Phase 3b), Dispatch (Phase 3d), Analytics (Phase 3e)
- **Settings sub-tabs:** Users (sortable columns, create user modal, drawer), Business Rules, Notifications, Guidelines, Data, Academic Terms
- **Rides panel:** Table view (sortable columns, page-based pagination with 25/50/100 rows per page), schedule grid view, filter bar, bulk ops, drawer, edit modal, CSV export, "New Ride" create modal (office creates rides on behalf of riders)
- **Dispatch panel:** KPIBar, PendingQueue, DispatchGrid with per-driver rows and ride strips, 5s polling
- **Staff panel:** EmployeeBar + ShiftCalendar (FullCalendar with deferred mount, drag-to-create, context menu, per-driver campus palette colors)
- **Fleet panel:** VehicleCard grid, VehicleDrawer, add/retire/delete/reactivate/maintenance modals
- **Analytics panel:** 31 widgets across 4 sub-tabs (Dashboard, Hotspots, Milestones, Attendance) + hardcoded Reports tab
- **Contexts:** AuthProvider(expectedRole="office"), TenantProvider(roleLabel="Office")
- Panel mounting: all panels mount simultaneously, toggle with `.tab-panel.active` CSS class

### Office Console Panel IDs
Default active tab is `dispatch-panel`. Navigation buttons use `data-target` attribute.
| Panel ID | Purpose |
|----------|---------|
| `dispatch-panel` | Default — KPI cards, pending queue, today's board (schedule grid) |
| `rides-panel` | Rides table/calendar views with filter pills |
| `staff-panel` | Driver shifts management |
| `fleet-panel` | Vehicle management |
| `analytics-panel` | Widget dashboard (sub-panels: `analytics-dashboard-view`, `analytics-hotspots-view`, etc.) |
| `map-panel` | Campus map iframe |
| `settings-panel` | Tenant settings + users management (`admin-users-view` sub-panel) |
| `profile-panel` | Current user profile |

Analytics dashboard uses `#widget-grid` container (not a KPI grid). Date filters: `#analytics-from`, `#analytics-to`, `#analytics-refresh-btn`.

### Driver Console (React — client/src/driver/)
- **Built with React 19 + Vite**, served from `client/dist/driver.html` via `/app/` static route. Legacy fallback at `public/driver-legacy.html`
- Bottom tab navigation: `home-panel` (default), `rides-panel`, `map-panel`, `account-panel` — managed by `App.jsx` state
- **Hooks:** useDriverData (3s polling via usePolling), useClockStatus, useDriverRides, useGraceTimer
- Clock button: renders text "CLOCK IN" or "CLOCK OUT" (test selectors preserved)
- Clock out triggers confirmation via shared `useModal()` (modal class: `ro-modal-overlay.open`)
- Account tab uses shared `<ProfileForm idPrefix="profile-" />` producing `#profile-name` and `#profile-phone`
- Account tab includes `NotificationToggles` for driver notification preferences (Ride Reminders, Shift & Attendance groups). Preferences default: in-app ON, email OFF
- **Contexts:** AuthProvider(expectedRole="driver"), TenantProvider(roleLabel="Driver")

### Rider Console (React — client/src/)
- **Built with React 19 + Vite**, served from `client/dist/` via `/app/` static route (backward-compat `/rider-app/` alias)
- Bottom tab navigation: `book-panel` (default), `myrides-panel`, `history-panel` — managed by `App.jsx` state
- **3-step booking wizard** (React components): StepWhere (`#pickup-location`, `#dropoff-location`), StepWhen (`#step-2`, `#date-chips`, `#ride-time`), StepConfirm (`#step-3`, `#notes`, `#recurring-toggle`, `#confirm-btn`)
- **`autoSwitchToActiveRide()`**: On initial rides load, if rider has any active rides, switches to `myrides-panel`. Tests must explicitly click the Book tab.
- My Rides content rendered into `#myrides-content` (HeroCard + RideStrip components)
- Grace timer: `GraceTimer.jsx` with SVG countdown circle
- Account settings via gear button (`#gear-btn`) → `SettingsDrawer` (ProfileForm, AvatarPicker, PasswordChange)
- Notifications via bell button → `NotificationDrawer` (selection, bulk read/clear)
- Settings drawer includes `NotificationToggles` for rider notification preferences (Ride Updates, Account groups). Preferences default: in-app ON, email ON
- **Contexts:** AuthContext (user, logout), TenantContext (config, theming), ToastContext (showToast)
- **Hooks:** usePolling (5s rides, 30s notifications, visibilitychange pause), useRides, useLocations, useOpsConfig, useNotifications
- **All test-critical element IDs preserved** from vanilla version (#book-panel, #myrides-panel, #pickup-location, etc.)

### Analytics Architecture (React — client/src/office/components/analytics/)
- **Widget System:** 31 widgets across 8 categories on 4 tabs (Dashboard, Hotspots, Milestones, Attendance). Reports tab is hardcoded (no widget grid). **react-grid-layout v2** (npm in `client/`) for 12-column drag-and-drop layout with vertical compaction.
- **react-grid-layout:** Replaced GridStack.js entirely. React-native, handles drag/resize/compact natively. `WidgetCard` uses `React.forwardRef` — react-grid-layout injects resize handle elements as `{children}`.
- **KPI widgets are individual:** 6 dashboard KPIs (`kpi-total-rides`, `kpi-completion-rate`, `kpi-no-show-rate`, `kpi-active-riders`, `kpi-driver-punctuality`, `kpi-fleet-available`) and 5 attendance KPIs (`kpi-total-clock-ins`, `kpi-on-time-rate`, `kpi-tardy-count`, `kpi-avg-tardiness`, `kpi-missed-shifts`). All headerless (`isKPI: true`), min 2×2, individually removable/resizable.
- **Layout Version:** `WIDGET_LAYOUT_VERSION = 7` in `constants.js` — bump to force localStorage layout reset when changing default layouts.
- **Chart.js v4 (npm):** `chart.js` + `react-chartjs-2` installed in `client/`. `chartSetup.js` registers all components once. CDN Chart.js removed from `office.html` (remains only in legacy `public/index-legacy.html`).
- **Chart Colors:** All charts use `getCampusPalette()` from `campus-themes.js` for campus-aware theming.
- **Doughnut charts:** Must include `hoverOffset: 6` and `hoverBorderWidth: 3` in datasets for the pop-out hover effect.
- **Excel Export:** 8-sheet workbook via exceljs (Summary, Daily Volume, Routes, Driver Performance, Rider Analysis, Fleet, Shift Coverage, Peak Hours).
- **Calendar View Filters:** Calendar (FullCalendar) respects the same status/date/text filter pills as the table view via `renderRideViews()` helper.
- **FullCalendar deferred mount:** FullCalendar and other dimension-dependent components must not mount while their panel is hidden. Use `isVisible` + `hasBeenVisible` deferred-mount pattern with a shimmer placeholder. See ShiftCalendar and MapPanel for reference.

## Database Schema

14 tables — see `db/schema.sql` for full field definitions, `lib/db.js` for migrations.

### Tables
users, shifts, rides, ride_events, recurring_rides, rider_miss_counts, vehicles, maintenance_logs, clock_events, tenant_settings, notification_preferences, notifications, program_content, academic_terms

### Key Gotchas
- **IDs are text, not UUID:** Pattern `prefix_${random}` (e.g., `ride_abc123`). Always use `$1::text[]` for array casts, never `$1::uuid[]`
- **rider_miss_counts:** Keyed by `rider_id` (PK, FK to `users.id`) — tracks consecutive no-shows per rider
- **shifts.week_start:** When set (DATE), shift only appears that specific week. When NULL, acts as a recurring template
- **users.active:** Only meaningful for drivers — TRUE when clocked in, FALSE otherwise
- **users.deleted_at:** Soft-delete timestamp. NULL = active, non-NULL = deleted. Login, auth middleware, and all operational queries filter `WHERE deleted_at IS NULL`. Analytics/ride JOINs do NOT filter (preserve historical names). Username/email uniqueness enforced only among active users via partial unique indexes
- **notification_preferences:** UNIQUE(user_id, event_type, channel) — lazy-seeded on first GET, role-aware (seeds only targetRole-matching event types)
- **rides.ride_upcoming_notified_at:** TIMESTAMPTZ — set when driver_upcoming_ride notification sent, prevents duplicate reminders

### Configurable Settings (tenant_settings)
| Key | Default | Type | Category |
|-----|---------|------|----------|
| max_no_show_strikes | 5 | number | rides |
| grace_period_minutes | 5 | number | rides |
| strikes_enabled | true | boolean | rides |
| tardy_threshold_minutes | 1 | number | staff |
| service_hours_start | 08:00 | time | operations |
| service_hours_end | 19:00 | time | operations |
| operating_days | 0,1,2,3,4 | string | operations |
| auto_deny_outside_hours | true | boolean | operations |
| notify_office_tardy | true | boolean | notifications |
| notify_rider_no_show | true | boolean | notifications |
| notify_rider_strike_warning | true | boolean | notifications |
| ride_retention_value | 0 | number | data |
| ride_retention_unit | months | select | data |
| academic_period_label | Semester | select | operations | *(deprecated — academic terms now user-defined via academic_terms table)* |

## Ride Status Flow

```
pending → approved → scheduled → driver_on_the_way → driver_arrived_grace → completed
             ↓                                                                   ↓
           denied                                                             no_show
```

**Status transitions:**
1. Rider submits → `pending`
2. Office approves/denies → `approved` or `denied`
3. Driver claims approved ride → `scheduled`
4. Driver presses "On My Way" → `driver_on_the_way`
5. Driver presses "I'm Here" → `driver_arrived_grace` (starts 5-min grace timer)
6. Driver completes or marks no-show → `completed` or `no_show`

Riders can cancel pending/approved rides. Office can cancel any non-terminal ride.

**On server restart:** `driver_on_the_way` and `driver_arrived_grace` rides are automatically reverted to `scheduled` with a `system_recovery` audit event. All driver `active` states are reset to `FALSE`.

## Business Rules (CRITICAL — do not break these)

- **Service hours:** Configurable via tenant_settings (default: Monday–Friday, 8:00 AM – 7:00 PM)
- **Campus only:** Golf carts cannot leave campus (no off-campus destinations)
- **Grace period:** Configurable minutes after driver arrives before no-show allowed (default: 5)
- **No-show tracking:**
  - Configurable consecutive no-shows = automatic service termination (default: 5)
  - Completed rides reset rider's consecutive miss count to 0
  - Miss count stored per rider email in `rider_miss_counts` table
- **Driver requirements:**
  - Must be clocked in (`active = TRUE`) to claim rides
  - Only approved, unassigned rides can be claimed
  - Only assigned driver (or office) can perform ride actions
- **Ride approval:** Office must check miss count < max strikes before approving rides
- **Rider termination enforcement:** When missCount >= maxStrikes AND strikes_enabled, riders receive 403 on ride submission and see termination banner in rider UI. Office can reinstate via miss count reset.
- **Driver clock-out guard:** Drivers cannot clock out with rides in scheduled/driver_on_the_way/driver_arrived_grace. Must complete or unassign first (409 response).

## API Endpoints Overview

15 route modules in `routes/` — see individual files for full endpoint listings. Role middleware: `requireAuth`, `requireOffice`, `requireStaff`, `requireRider`.

### Key Non-Obvious Patterns
- **`PUT /api/settings`** expects a bare array `[{ key, value }, ...]`, NOT a plain object
- **Bulk-delete:** Rides and notifications use `POST /api/rides/bulk-delete` / `POST /api/notifications/bulk-delete` with `{ ids: [...] }` body. Notifications also have `DELETE /api/notifications/all` for clearing beyond the 50-item page limit
- **Analytics endpoints** all support `?from=&to=` date filtering (except `milestones`). Use `GET /api/analytics/{endpoint}`
- **Ride lifecycle actions:** `POST /api/rides/:id/{action}` where action is `approve|deny|claim|on-the-way|here|complete|no-show|cancel`. Office can claim on behalf with `{ driverId }` in body
- **Office-created rides:** `POST /api/rides` by an office user reads `riderName`, `riderEmail`, `riderPhone` from the request body (instead of session). Ride is created with status `pending`
- **`GET /api/rides` pagination:** Without `limit` param returns flat array (legacy). With `limit` returns `{ rides, nextCursor, totalCount, hasMore }`. Supports `offset` param for page-based pagination (used by RidesPanel) and `cursor` param for keyset pagination. Server-side filters: `status` (comma-separated), `from`/`to` (date range), `search` (ILIKE). Order: `requested_time DESC, id DESC`. Max limit: 200
- **Soft-delete users:** `DELETE /api/admin/users/:id` sets `deleted_at = NOW()` (no hard delete). `POST /api/admin/users/:id/restore` clears `deleted_at`. `GET /api/admin/users?include_deleted=true` shows deleted users
- **`GET /api/tenant-config?campus=slug`** is public (no auth) — used for FOUC prevention
- **`NOTIFICATION_EVENT_TYPES`:** Office: driver_tardy, rider_no_show, rider_approaching_termination, rider_terminated, ride_pending_stale, driver_missed_ride, new_ride_request. Driver: driver_upcoming_ride, driver_new_assignment, driver_ride_cancelled, driver_late_clock_in, driver_missed_shift. Rider: rider_ride_approved, rider_ride_denied, rider_driver_on_way, rider_driver_arrived, rider_ride_completed, rider_ride_cancelled, rider_no_show_notice, rider_strike_warning, rider_terminated_notice. Each entry has `targetRole` field ('office'|'driver'|'rider')
- **Dev-only:** `POST /api/dev/seed-rides` (disabled in production), `POST /api/dev/reseed` (DEMO_MODE only)

## Code Conventions

- **Module system:** CommonJS (`require`), NOT ES modules (`import/export`)
- **No build step** — edit files directly, refresh browser
- **CSS:** CSS custom properties from `rideops-theme.css`, Tabler Icons (`ti ti-*`)
- **Error handling:** Return `{ error: 'message' }` JSON on errors
- **Date/time:** Use ISO 8601 strings, PostgreSQL TIMESTAMPTZ columns
- **Validation:** Server-side validation for all inputs (member ID via tenant pattern, service hours, etc.)
- **Security:** Never expose password hashes; sanitize all database queries with parameterized statements
- **Branding:** Never hardcode org-specific text (USC, DART, etc.) — use tenant config. Default to "RideOps"
- **ID format:** Text-based IDs like `ride_abc123`, `notif_xyz789` — NOT UUIDs. Use `$1::text[]` for array casts, never `$1::uuid[]`
- **Password minimum:** 8 characters (`MIN_PASSWORD_LENGTH` constant) — enforced in signup, change-password, admin-create, and admin-reset
- **Multi-step DB operations:** Always wrap in transactions (`BEGIN`/`COMMIT`/`ROLLBACK` via `pool.connect()`)
- **`addRideEvent()` transactions:** Accepts optional `txClient` parameter for transaction passthrough
- **Toast notifications:** Use `showToastNew()` from `rideops-utils.js` (never `showToast` from `utils.js`)
- **Modals:** Use `showModalNew()` from `rideops-utils.js` (returns Promise, supports `await`) — never `showConfirmModal`
- **Empty states:** Use `showEmptyState()` with Tabler icon names (`ti ti-*`)
- **Polling:** All polling intervals must pause via `visibilitychange` listener when tab is backgrounded
- **URL references:** Use extensionless paths (`/login` not `/login.html`)
- **Fetch response checks:** All `fetch()` calls MUST check `res.ok` before showing success feedback. Always handle error responses with `showToastNew(data.error, 'error')`
- **NPM in client/:** `chart.js`, `react-chartjs-2`, and `react-grid-layout` are npm dependencies inside `client/`. The vendor rule ("Don't npm install Tabler, FullCalendar...") applies only to vanilla JS pages in `public/`. React components in `client/src/` should use npm imports
- **KPI widgets are headerless** (`isKPI: true` in WIDGET_REGISTRY) — content scales with container. All widgets should be resizable (never use `noResize: true` or `static: true`)
- **WidgetCard forwardRef:** react-grid-layout injects resize handle elements as children. `WidgetCard` must use `React.forwardRef` and include `{children}` at the end of its render output
- **FullCalendar deferred mount:** FullCalendar and other dimension-dependent components must not mount while their panel is hidden. Use `isVisible` + `hasBeenVisible` deferred-mount pattern with a shimmer placeholder

## Testing

### Test Suite
- **Framework:** Playwright (config in `playwright.config.js`)
- **Files:** `tests/e2e.spec.js` (~99 tests), `tests/uat.spec.js` (4 tests)
- **Run:** `npx playwright test` (requires server running on port 3000)
- **Server must be running** with `DEMO_MODE=true` for seed data

### Test Conventions
- API tests use `playwright.request.newContext()` with cookie-based auth
- UI tests use `loginUI()` helper that navigates and submits the login form
- `test.describe.serial` for groups with shared state (ride lifecycle, clock events)
- Settings API expects bare array format: `[{ key: 'grace_period_minutes', value: '0' }]` (Playwright's `data:` wrapper is NOT part of the JSON payload)
- Rider tests must explicitly click `button[data-target="book-panel"]` because `autoSwitchToActiveRide()` may hide the booking wizard
- Driver tests reference dynamically rendered content (e.g., `button:has-text("CLOCK IN")`) — no static element IDs for clock or ride sections
- Modal confirmation selector: `.ro-modal-overlay.open button:has-text("...")` (not `.show`)

## UI Redesign Architecture

The frontend uses a Tabler-based design system.

### Vendored Assets (public/vendor/)
All CSS/JS dependencies are vendored locally in `public/vendor/` for offline reliability (no CDN requests). Do NOT npm install these — they are loaded via `<link>` / `<script>` tags in HTML files:
- Tabler CSS: `public/vendor/tabler/tabler.min.css`
- Tabler Icons: `public/vendor/tabler-icons/tabler-icons.min.css` (+ fonts/ subdirectory)
- FullCalendar: `public/vendor/fullcalendar/index.global.min.js` (office view only)
- Quill: `public/vendor/quill/quill.snow.css` + `quill.min.js` (office view only)
- GridStack: `public/vendor/gridstack/gridstack.min.css` + `gridstack-all.js` (legacy only)
- Chart.js: `public/vendor/chartjs/chart.min.js` (legacy only — React uses npm)
- DiceBear API: `https://api.dicebear.com/9.x` — runtime API (stays external), fails gracefully

### npm Dependencies in client/ (do NOT load from CDN)
- `chart.js` + `react-chartjs-2` — Chart.js v4 for React (doughnut, bar, line/area charts). CDN tag removed from `office.html`
- `react-grid-layout` v2 — 12-column widget dashboard layout (drag/resize/vertical-compact). Replaced GridStack.js entirely. CSS imported via `react-grid-layout/css/styles.css` and `react-resizable/css/styles.css`

### Color System (Three-Layer Theming)
- **Layer 1 — Platform defaults** (in rideops-theme.css :root): SteelBlue #4682B4 primary, Tan #D2B48C accent
- **Layer 2 — Tenant override** (injected by JS from /api/tenant-config): primaryColor, secondaryColor
- **Layer 3 — Campus palette** (campus-themes.js): Per-campus color arrays for charts, dispatch grid, analytics
- **FOUC Prevention:** All pages (index.html, driver.html, rider.html, login.html, signup.html) include synchronous `<script>` in `<head>` that reads `CAMPUS_THEMES[slug]` and sets `--color-primary`, `--color-primary-rgb`, `--color-header-bg`, `--color-sidebar-bg` before first paint
- **Status colors are semantic and universal** — never overridden per tenant

### CRITICAL: Panel Visibility
rideops-theme.css contains these rules that make navigation work:
```css
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.sub-panel { display: none; }
.sub-panel.active { display: block; }
```

### Status Names (immutable — referenced across entire codebase)
pending, approved, scheduled, driver_on_the_way, driver_arrived_grace, completed, no_show, denied, cancelled

### Bulk Operations Pattern
- Rides and notifications use bulk-delete via POST with `{ ids: [...] }` body
- Users use individual DELETE in a loop (since each may fail independently)
- Ride checkbox selections persist across 5s polling re-renders (not reset on table refresh)
- Notification "Select All + Delete" with more beyond the 50-item page limit uses `DELETE /api/notifications/all` endpoint
- Notification drawer shows "Showing X of Y" when paginated, "Clear All (N)" with total count

## What NOT to Do

- **React migration complete:** All views (rider, driver, office) are fully React (`client/src/rider/`, `client/src/driver/`, `client/src/office/`). `public/app.js` and `public/index-legacy.html` are legacy fallback only — do not add new features to them
- Don't replace Express with another framework
- Don't change ride status names (referenced across frontend + backend)
- Don't use ES module syntax (`import/export`) in backend — project uses CommonJS. `client/` uses ES modules (Vite)
- Don't remove business rule validations (service hours, no-shows, grace period, etc.)
- Don't expose sensitive data (password hashes, tokens) in API responses
- Don't skip server-side validation — never trust client input
- Don't hardcode hex colors in HTML or JS — use CSS custom properties from rideops-theme.css
- Don't use Material Symbols — use Tabler Icons (ti ti-*)
- Don't npm install Tabler or FullCalendar — they are vendored in `public/vendor/`. Chart.js and react-grid-layout are npm in `client/` (not vendored)
- Don't use GridStack — removed from the project. react-grid-layout is the widget layout library
- Don't add Chart.js or GridStack CDN tags to `client/office.html` — they're npm packages now
- Don't forget `{children}` in WidgetCard — react-grid-layout injects resize handles as children
- Don't set `noResize: true` or `static: true` on widget registry entries — all widgets should be resizable
- Don't hardcode organization-specific text — use tenant config, default to "RideOps"
- Don't remove `.tab-panel` / `.sub-panel` CSS classes from panel elements
- Don't use `$1::uuid[]` for array parameter casts — IDs are text format, use `$1::text[]`
- Don't reset bulk-selection Sets on table re-render — preserve selections across polling cycles

## Known Issues & Tech Debt

All resolved items documented in `docs/reference/AUDIT_REPORT.md`.

### Open Issues
- **Rides pagination:** RidesPanel uses offset-based pagination (25/50/100 per page with page navigation). Dispatch and driver still fetch all today's rides (date-filtered, no pagination).
- **Phone numbers not validated:** `riderPhone` stored without format validation (server-side).
- **Rate limiting disabled in dev:** Login allows 1000 req/15min in development (10 in production). Intentional.
- **Inline styles in React components:** Resolved — 419→239 occurrences (43% reduction). Utility classes in rideops-theme.css Section 22. Remaining 239 are genuinely dynamic (computed values, conditional logic, CSS variable colors).
- **No SSO/SAML:** Auth is session-based only. SSO integration is a potential future enhancement for enterprise campus deployments.
