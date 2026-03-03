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
Defines complete per-campus overrides merged into `/api/tenant-config` response: orgName, orgShortName, orgTagline, orgInitials, primaryColor, secondaryColor, secondaryTextColor, sidebarBg, sidebarText, sidebarActiveBg, sidebarHover, sidebarBorder, headerBg, mapUrl, mapEmbeddable, campusKey, locationsKey, idFieldLabel, idFieldPattern, idFieldMaxLength, idFieldPlaceholder, serviceScopeText, timezone, rules. When no campus slug is active, DEFAULT_TENANT values are used (SteelBlue RideOps branding).
- **`mapEmbeddable`:** Boolean flag. `true` for all four campuses (USC, Stanford, UCLA, UCI). Office/driver views render fallback "Open Campus Map" card when `false`.

## Tech Stack
- **Backend:** Node.js (>=18) + Express + express-session + bcryptjs
- **Database:** PostgreSQL (via `pg` pool with connection pooling)
- **Sessions:** `connect-pg-simple` for PostgreSQL-backed session storage (auto-creates `session` table)
- **Rate Limiting:** `express-rate-limit` on auth endpoints (login 10/15min, signup 5/15min)
- **Frontend (Rider + Driver + Office):** React 19 + Vite multi-page build, built to `client/dist/`, served via `/app/` static route (backward-compat `/rider-app/` alias). Source in `client/src/rider/`, `client/src/driver/`, and `client/src/office/`
- **Frontend (Office — partial migration):** Office shell (layout, sidebar, header) + Map, Profile, Settings panels migrated to React (Phase 3a). Dispatch, Rides, Staff, Fleet, Analytics panels are placeholders pending Phases 3b–3e. Legacy vanilla JS fallback at `public/index-legacy.html`
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
SMTP_HOST=                     # SMTP server hostname (optional — falls back to console logging)
SMTP_PORT=587                  # SMTP port (default: 587)
SMTP_SECURE=false              # Use TLS (default: false)
SMTP_USER=                     # SMTP username
SMTP_PASS=                     # SMTP password
NOTIFICATION_FROM=noreply@ride-ops.com  # Notification sender address
NOTIFICATION_FROM_NAME=RideOps          # Notification sender name
SESSION_SECRET=                # Required in production, random fallback in development
NODE_ENV=production            # Set for secure cookies and strict validation
```

Default login credentials (password: `demo123`):
- Office: `office`
- Drivers: `alex`, `jordan`, `taylor`, `morgan`
- Riders: `casey`, `riley`

## Deployment

### Railway (Production)
- **URL:** https://app.ride-ops.com (custom domain) / https://rideops-app-production.up.railway.app (Railway default)
- **Config:** `railway.json` defines health check, restart policy, Nixpacks builder, and `buildCommand` (runs `npm install && npm run build` to build React rider app)
- **Database:** Railway PostgreSQL addon (auto-provisions, sets DATABASE_URL)
- **SSL:** Required for database connections in production (`ssl: { rejectUnauthorized: false }`)
- **Health check:** `GET /health` — used by Railway for readiness checks
- **Environment:** All config via Railway environment variables (see `.env.example`)
- **Demo mode:** `DEMO_MODE=true` seeds 650+ rides on first startup (skips if data already exists), enables demo role picker at `/demo`
- **Deploys:** Automatic on push to `main` branch (Railway watches GitHub repo)
- **Deploy exclusions:** `.railwayignore` excludes screenshots/, docs/, tests/, scripts/ to reduce image size
- **No TENANT_FILE needed:** Multi-campus routing handled entirely by `campus-configs.js` + org-scoped URLs. Do NOT set `TENANT_FILE` env var.

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
- `routes/rides.js` — Ride CRUD, approve/deny, cancel, bulk-delete, unassign, reassign, edit, locations
- `routes/driver-actions.js` — claim, on-the-way, here, complete, no-show, vehicle assignment
- `routes/analytics.js` — All 19 analytics API endpoints + export-report (~2,100 lines)
- `routes/admin-users.js` — 9 admin user management endpoints
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
- `client/src/office/components/settings/` — SettingsPanel + 6 sub-panels (Users, BusinessRules, Notifications, Guidelines, Data, AcademicTerms) + UserDrawer
- `client/src/api.js` — Shared fetch wrappers for rider + driver API endpoints
- `client/src/components/booking/` — BookPanel, StepWhere, StepWhen, StepConfirm, DateChips, StepIndicator
- `client/src/components/rides/` — MyRidesPanel, HeroCard, GraceTimer
- `client/src/components/history/` — HistoryPanel, HistoryRow, RecurringSection
- `client/src/components/drawers/` — SettingsDrawer, ProfileForm, AvatarPicker, PasswordChange, NotificationDrawer
- `client/src/contexts/` — AuthContext, TenantContext, ToastContext
- `client/src/hooks/` — usePolling, useRides, useLocations, useOpsConfig, useNotifications
- `public/rider-legacy.html` — Vanilla rider (legacy reference, fallback if React build not present)
- `public/app.js` — Main frontend logic for office/admin console (~4,800 lines)
- `public/utils.js` — Shared UI utilities: empty state, dev-mode detection, toast icon helper (toast/modal functions moved to rideops-utils.js)
- `public/js/rideops-utils.js` — Shared UI utilities: `statusBadge()`, `showToastNew()`, `showModalNew()`, `initSidebar()`, `initBottomTabs()`, `formatTime()`, `formatDate()`, `renderNotificationDrawer()`, `pollNotificationCount()`
- `public/css/rideops-theme.css` — All CSS custom properties, component styles, layout classes
- `public/campus-themes.js` — Per-campus color palettes for charts/UI (`getCampusPalette()`)
- `public/js/widget-registry.js` — Widget definitions (WIDGET_REGISTRY, WIDGET_CATEGORIES, 22 widgets, 9 categories, per-tab default layouts: DEFAULT_WIDGET_LAYOUT, DEFAULT_HOTSPOTS_LAYOUT, DEFAULT_MILESTONES_LAYOUT, DEFAULT_ATTENDANCE_LAYOUT)
- `public/js/widget-system.js` — Widget dashboard runtime: multi-instance architecture (createWidgetInstance), GridStack.js 12-column grid, layout persistence, edit mode (drag/resize/add/remove/set-default/reset)
- `public/js/chart-utils.js` — Chart.js instance registry (_chartInstances, destroyChart), resolveColor, showAnalyticsSkeleton, makeSortable
- `public/js/analytics.js` — All analytics renderers, loaders, caches, widget orchestrators (~1,800 lines). Extracted from app.js
- ~~`public/driver.html`~~ — **Migrated to React** (see `client/src/driver/`). Legacy version at `public/driver-legacy.html`
- `client/src/driver/` — React driver app (Vite + React 19). Components, hooks, driver.css. Builds to `client/dist/driver.html`
- ~~`public/rider.html`~~ — **Migrated to React** (see `client/`). Legacy version at `public/rider-legacy.html`
- `public/index-legacy.html` — Legacy vanilla JS office/admin console (fallback when React build not present)
- `tests/e2e.spec.js` — Comprehensive E2E/API test suite (~97 tests): auth, rides, lifecycle, recurring, vehicles, analytics, settings, UI panels, clock events, authorization
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
- `notification-service.js` — Notification dispatch engine: `dispatchNotification()` sends to office staff via preferences, `sendRiderEmail()` sends directly to riders, `setTenantConfig()` injects org branding into email templates
- `demo-seed.js` — Seeds demo data: 650+ rides, 5 weeks of shifts, clock events, recurring rides, vehicles, notifications
- `public/favicon.svg` — RideOps favicon (blue circle with RO)
- `db/schema.sql` — PostgreSQL schema reference
- `docs/reference/AUDIT_REPORT.md` — Post-analytics-overhaul platform audit (2026-03-02)
- `docs/reference/SECURITY.md` — Security posture overview for university IT evaluators

## Project Structure

### Documentation (`docs/`)
- `docs/reference/` — Living reference docs (tooling, audit reports, campus research, theme specs)
- `docs/architecture/` — Technical design documents (analytics architecture, redesign plans)
- `docs/prompts/` — Saved Claude Code prompt templates for complex features
- `docs/audits/` — Historical audit reports (.docx)

### Screenshots (`screenshots/`)
- `screenshots/marketing/` — Automated product screenshots (19 images: dispatch, rides, analytics, driver, rider, rider wizard carousel, themes)
- `screenshots/linkedin/` — Marketing screenshots for social media
- `screenshots/design-inspiration/` — UI reference material with subdirectories by feature area
- `screenshots/development/` — Development verification screenshots (theme checks, UI states, etc.)

### Scripts (`scripts/`)
- `scripts/take-screenshots.js` — Playwright screenshot automation for marketing/README images (requires server running with `DEMO_MODE=true`)
- Utility scripts for screenshot automation and dev workflows. Not part of the app runtime.

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

### Frontend Architecture
- Frontend uses vanilla JS with `fetch()` to call REST API
- No SPA router — navigation via buttons that show/hide `.tab-panel` sections
- Each HTML page is self-contained:
  - `index.html` loads chart-utils.js → analytics.js → app.js for office console logic
  - `driver.html` has inline `<script>` for driver interface
  - `rider.html` has inline `<script>` for rider interface
- **Script loading order** (index.html): utils.js → rideops-utils.js → widget-registry.js → widget-system.js → chart-utils.js → analytics.js → app.js. All are plain `<script>` globals (no module system)
- Tenant theming: pages fetch `/api/tenant-config` and apply dynamic branding
- Campus detection: URL path parsing (`/usc/office` → campus=usc) + session fallback
- Polling intervals (all pause via `visibilitychange` when tab is backgrounded):
  - Office console: rides refresh every 5s
  - Driver console: data refresh every 3s, grace timers update every 1s
  - Rider console: rides refresh every 5s

### Office Console (React — client/src/office/)
- **Built with React 19 + Vite**, served from `client/dist/office.html` via `/app/` static route. Legacy fallback at `public/index-legacy.html`
- Sidebar navigation with 8 nav items: dispatch, rides, staff, fleet, analytics, map, settings, profile
- **Migrated panels (Phase 3a):** Map, Profile, Settings (6 sub-tabs: Users, Business Rules, Notifications, Guidelines, Data, Academic Terms)
- **Placeholder panels (pending):** Dispatch (3d), Rides (3c), Staff & Shifts (3b), Fleet (3b), Analytics (3e)
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
- **Contexts:** AuthContext (user, logout), TenantContext (config, theming), ToastContext (showToast)
- **Hooks:** usePolling (5s rides, 30s notifications, visibilitychange pause), useRides, useLocations, useOpsConfig, useNotifications
- **All test-critical element IDs preserved** from vanilla version (#book-panel, #myrides-panel, #pickup-location, etc.)

### Analytics Architecture
- **Widget System:** 22 widgets across 9 categories on 4 tabs (Dashboard, Hotspots, Milestones, Attendance). Reports tab stays hardcoded. GridStack.js v12 (CDN, not npm) for 12-column drag-and-drop layout.
- **GridStack v12 API:** Use `grid.makeWidget(el)` for dynamically added widgets. Do NOT use `grid.addWidget(el, opts)` — deprecated in v12. Widgets use `gs-*` attributes (gs-id, gs-x, gs-y, gs-w, gs-h, etc.).
- **Widget Container ID Prefixes:** Dashboard `chart-`/`w-`, Hotspots `ht-`, Milestones `ms-`, Attendance `att-`. Per-tab overrides via `containerOverrides` in widget instance config.
- **Layout Version:** `WIDGET_LAYOUT_VERSION = 3` in widget-system.js — bump this to force layout reset when changing default layouts.
- **Chart.js v4:** `_chartInstances` registry tracks instances; always call `destroyChart(containerId)` before re-render. `resolveColor()` converts CSS custom properties to hex for canvas rendering.
- **Data Caching:** `_tardinessCache` and `_hotspotsCache` prevent duplicate API calls when multiple widgets share the same data source.
- **Chart Colors:** All charts use `getCampusPalette()` from `campus-themes.js` for campus-aware theming.
- **Excel Export:** 8-sheet workbook via exceljs (Summary, Daily Volume, Routes, Driver Performance, Rider Analysis, Fleet, Shift Coverage, Peak Hours).
- **Calendar View Filters:** Calendar (FullCalendar) respects the same status/date/text filter pills as the table view via `renderRideViews()` helper.

## Database Schema

14 tables — see `db/schema.sql` for full field definitions, `lib/db.js` for migrations.

### Tables
users, shifts, rides, ride_events, recurring_rides, rider_miss_counts, vehicles, maintenance_logs, clock_events, tenant_settings, notification_preferences, notifications, program_content, academic_terms

### Key Gotchas
- **IDs are text, not UUID:** Pattern `prefix_${random}` (e.g., `ride_abc123`). Always use `$1::text[]` for array casts, never `$1::uuid[]`
- **rider_miss_counts:** Keyed by `email` (PK), not user ID — tracks consecutive no-shows per rider email
- **shifts.week_start:** When set (DATE), shift only appears that specific week. When NULL, acts as a recurring template
- **users.active:** Only meaningful for drivers — TRUE when clocked in, FALSE otherwise
- **notification_preferences:** UNIQUE(user_id, event_type, channel) — lazy-seeded on first GET

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
- **`GET /api/tenant-config?campus=slug`** is public (no auth) — used for FOUC prevention
- **`NOTIFICATION_EVENT_TYPES`:** driver_tardy, rider_no_show, rider_approaching_termination, rider_terminated, ride_pending_stale, new_ride_request
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

## Testing

### Test Suite
- **Framework:** Playwright (config in `playwright.config.js`)
- **Files:** `tests/e2e.spec.js` (~97 tests), `tests/uat.spec.js` (4 tests)
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

### CDN Dependencies (do NOT npm install these)
- Tabler CSS: `https://cdn.jsdelivr.net/npm/@tabler/core@1.2.0/dist/css/tabler.min.css`
- Tabler Icons: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.37.1/dist/tabler-icons.min.css`
- FullCalendar: `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.17/index.global.min.js` (office view only)
- GridStack.js: `https://cdn.jsdelivr.net/npm/gridstack@12/dist/gridstack-all.js` + `gridstack.min.css` (analytics widget grid layout, drag-and-drop, resize)
- Chart.js v4: `https://cdn.jsdelivr.net/npm/chart.js@4` (donut, bar, line/area charts — canvas-based, auto-resize)
- DiceBear API: `https://api.dicebear.com/9.x` — client-side avatar generation, no API key needed

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

### Profile Cards & Avatars
- Profile cards use `.profile-card`, `.profile-avatar` classes from rideops-theme.css (Section 26)
- Avatar picker (`.avatar-picker`, `.avatar-option`) and helper functions in rideops-utils.js
- Helpers: `profileCardHTML(user, opts)`, `profileAvatarHTML(avatarUrl, name, size)`, `avatarPickerHTML(url, userId)`, `initAvatarPicker(containerId, userId, onSelect)`
- Default avatar: DiceBear `initials` style (`defaultAvatarUrl(name)`) when no `avatar_url` is set

### Status Names (immutable — referenced across entire codebase)
pending, approved, scheduled, driver_on_the_way, driver_arrived_grace, completed, no_show, denied, cancelled

### Bulk Operations Pattern
- Rides and notifications use bulk-delete via POST with `{ ids: [...] }` body
- Users use individual DELETE in a loop (since each may fail independently)
- Ride checkbox selections persist across 5s polling re-renders (not reset on table refresh)
- Notification "Select All + Delete" with more beyond the 50-item page limit uses `DELETE /api/notifications/all` endpoint
- Notification drawer shows "Showing X of Y" when paginated, "Clear All (N)" with total count

## What NOT to Do

- **React migration in progress:** Rider, driver, and office shell are React (`client/src/rider/`, `client/src/driver/`, `client/src/office/`). Office dispatch, rides, staff, fleet, and analytics panels are placeholders — migrate in Phases 3b–3e
- Don't replace Express with another framework
- Don't change ride status names (referenced across frontend + backend)
- Don't use ES module syntax (`import/export`) in backend — project uses CommonJS. `client/` uses ES modules (Vite)
- Don't remove business rule validations (service hours, no-shows, grace period, etc.)
- Don't expose sensitive data (password hashes, tokens) in API responses
- Don't skip server-side validation — never trust client input
- Don't hardcode hex colors in HTML or JS — use CSS custom properties from rideops-theme.css
- Don't use Material Symbols — use Tabler Icons (ti ti-*)
- Don't npm install Tabler, FullCalendar, or any CDN dependency — load from CDN only
- Don't hardcode organization-specific text — use tenant config, default to "RideOps"
- Don't remove `.tab-panel` / `.sub-panel` CSS classes from panel elements
- Don't use `$1::uuid[]` for array parameter casts — IDs are text format, use `$1::text[]`
- Don't reset bulk-selection Sets on table re-render — preserve selections across polling cycles

## Known Issues & Tech Debt

All resolved items documented in `docs/reference/AUDIT_REPORT.md`.

### Open Issues
- **No pagination on rides API:** Returns all rides every 5 seconds.
- **Railway custom domain:** `app.ride-ops.com` CNAME configured in Squarespace DNS pointing to Railway service.
- **Phone numbers not validated:** `riderPhone` stored without format validation (server-side).
- **Rate limiting disabled in dev:** Login allows 1000 req/15min in development (10 in production). Intentional.
- **Default credentials logged in dev:** Startup prints default logins to console when `NODE_ENV !== 'production'`.
- **`/health` not wrapped in `wrapAsync()`:** Has its own try/catch, functionally safe but inconsistent.
