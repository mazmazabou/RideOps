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
- Routes registered for each slug: `/:slug`, `/:slug/driver`, `/:slug/rider`, `/:slug/signup`
- Session stores `campus` slug for context
- `GET /api/tenant-config?campus=usc` merges campus config with defaults
- Frontend detects campus from URL path and applies dynamic CSS vars
- Login redirects to org-scoped URLs (e.g., `/usc/driver`)
- Legacy routes (`/office`, `/driver`, `/rider`, `/login`) still work with default branding

### Campus Themes (public/campus-themes.js)
- `CAMPUS_THEMES` object defines per-campus color palettes (8-14 hex colors each)
- `getCampusPalette(campusKey)` returns ordered color array for charts, dispatch grids, hotspot bars
- Used for chart colors, driver shift bands, and analytics visualizations

### Tenant Config Shape
```json
{
  "orgName": "USC DART",
  "orgShortName": "DART",
  "orgTagline": "Disabled Access to Road Transportation",
  "orgInitials": "DT",
  "primaryColor": "#990000",
  "secondaryColor": "#FFCC00",
  "mapUrl": "https://maps.usc.edu/",
  "idFieldLabel": "USC ID",
  "idFieldMaxLength": 10,
  "idFieldPattern": "^\\d{10}$",
  "locationsFile": "usc-buildings.js",
  "rules": ["..."]
}
```

### Server-Side Campus Configs (tenants/campus-configs.js)
Defines branding overrides per campus: orgName, orgShortName, orgTagline, orgInitials, primaryColor, secondaryColor, sidebarBg, sidebarText, headerTint, mapUrl, locationsFile, idFieldLabel/Pattern/MaxLength.

## Tech Stack
- **Backend:** Node.js + Express + express-session + bcryptjs
- **Database:** PostgreSQL (via `pg` pool with connection pooling)
- **Frontend:** Vanilla HTML/CSS/JS (no framework). Multi-page: index.html (office/admin), driver.html, rider.html, login.html, signup.html
- **Auth:** Session-based with bcrypt password hashing. Default password: `demo123`
- **Email:** Nodemailer with optional SMTP (falls back to console logging)

## Running the Application

```bash
# Start server (port 3000 by default)
node server.js

# Development mode with auto-restart
npx nodemon server.js

# With USC DART tenant
TENANT_FILE=tenants/usc-dart.json node server.js

# Demo mode (seeds 650+ rides, shifts, clock events, notifications)
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
```

Default login credentials (password: `demo123`):
- Office: `office`
- Drivers: `alex`, `jordan`, `taylor`, `morgan`
- Riders: `casey`, `riley`

## Key Files

- `server.js` — Express server, all API routes, DB schema init, auth middleware, tenant loading, business logic
- `public/app.js` — Main frontend logic for office/admin console (~5000 lines)
- `public/utils.js` — Shared UI utilities: toast, modal, empty state, dev-mode detection
- `public/js/rideops-utils.js` — Shared UI utilities: `statusBadge()`, `showToastNew()`, `showModalNew()`, `initSidebar()`, `initBottomTabs()`, `formatTime()`, `formatDate()`, `renderNotificationDrawer()`, `pollNotificationCount()`
- `public/css/rideops-theme.css` — All CSS custom properties, component styles, layout classes
- `public/campus-themes.js` — Per-campus color palettes for charts/UI (`getCampusPalette()`)
- `public/demo-config.js` — Demo mode configuration
- `public/driver.html` — Driver-facing mobile view (self-contained with inline JS/CSS)
- `public/rider.html` — Rider request form and ride history (self-contained with inline JS/CSS)
- `public/index.html` — Office/admin console (dispatch, rides, staff, fleet, analytics, settings, users)
- `public/login.html` / `signup.html` — Auth pages with org-scoped URL support
- `public/demo.html` — Demo mode role picker with campus-specific links
- `tenants/campus-configs.js` — Server-side campus branding configs for all 4 campuses
- `tenants/usc-dart.json` — USC DART tenant configuration
- `tenants/usc-buildings.js` — 304 USC campus locations
- `tenants/stanford-locations.js` — 25 Stanford campus locations
- `tenants/ucla-locations.js` — 25 UCLA campus locations
- `tenants/uci-locations.js` — 25 UCI campus locations
- `tenants/default-locations.js` — 32 generic campus locations (default when no tenant)
- `email.js` — Email sending (nodemailer) with tenant-aware brand colors
- `notification-service.js` — Notification dispatch engine: `dispatchNotification()` sends to office staff via preferences, `sendRiderEmail()` sends directly to riders
- `demo-seed.js` — Seeds demo data: 650+ rides, 5 weeks of shifts, clock events, recurring rides, vehicles, notifications
- `public/favicon.svg` — RideOps favicon (blue circle with RO)
- `db/schema.sql` — PostgreSQL schema reference

## Architecture

### Backend Architecture
- All routes defined in `server.js`
- Tenant configuration: `loadTenantConfig()` reads `TENANT_FILE` env var, merges with `DEFAULT_TENANT`
- Campus configurations: `tenants/campus-configs.js` provides per-campus overrides
- Org-scoped routes dynamically registered for `VALID_ORG_SLUGS: ['usc', 'stanford', 'ucla', 'uci']`
- Campus locations loaded from tenant's `locationsFile` or `./tenants/default-locations`
- Database initialization runs on startup (`initDb()` function):
  - Creates tables if they don't exist
  - Runs migrations (including `usc_id` → `member_id` rename)
  - Seeds default users (drivers, office, sample riders)
  - Seeds default vehicles (3 standard + 1 accessible)
  - Seeds default tenant settings (14+ configurable keys)
- Session middleware for authentication
- Role-based access control via middleware: `requireAuth`, `requireOffice`, `requireStaff`, `requireRider`
- Database helpers: `query()`, `generateId()`, `addRideEvent()`, `mapRide()`, `getSetting()`

### Frontend Architecture
- Frontend uses vanilla JS with `fetch()` to call REST API
- No SPA router — navigation via buttons that show/hide `.tab-panel` sections
- Each HTML page is self-contained:
  - `index.html` loads `app.js` for office console logic
  - `driver.html` has inline `<script>` for driver interface
  - `rider.html` has inline `<script>` for rider interface
- Tenant theming: pages fetch `/api/tenant-config` and apply dynamic branding
- Campus detection: URL path parsing (`/usc/office` → campus=usc) + session fallback
- Polling intervals:
  - Office console: rides refresh every 5s
  - Driver console: data refresh every 3s, grace timers update every 1s
  - Rider console: rides refresh every 5s
- Ride checkbox selections persist across poll re-renders (not reset on table refresh)

## Database Schema

### Tables
- **users** — All users (office, drivers, riders)
  - `role`: 'office', 'driver', or 'rider'
  - `active`: TRUE when driver is clocked in (only for drivers)
  - Fields: id, username, password_hash, name, email, phone, member_id, role, active, avatar_url, preferred_name, major, graduation_year, bio, must_change_password, password_changed_at, created_at, updated_at
- **shifts** — Weekly schedule for drivers
  - Fields: id, employee_id, day_of_week (0-4 for Mon-Fri), start_time, end_time, week_start (DATE, nullable), notes
  - When `week_start` is set, the shift only appears on that specific week. When NULL, it acts as a recurring template.
- **rides** — All ride requests and their lifecycle
  - Fields: id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id, cancelled_by, created_at, updated_at
- **ride_events** — Audit log of all ride status changes
  - Fields: id, ride_id, actor_user_id, type, at (timestamp), notes, initials
- **recurring_rides** — Templates for recurring weekly ride patterns
  - Fields: id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week (array), start_date, end_date, status
- **rider_miss_counts** — Tracks consecutive no-shows per rider email
  - Fields: email (PK), count
- **vehicles** — Fleet management
  - Fields: id, name, type (standard/accessible), status (available/in_use/retired), total_miles, last_maintenance_date, notes, created_at
- **maintenance_logs** — Vehicle service history
  - Fields: id, vehicle_id, service_date, notes, mileage_at_service, performed_by, created_at
- **clock_events** — Historical record of driver clock-in/out with tardiness tracking
  - Fields: id, employee_id, shift_id, event_date (DATE), scheduled_start (TIME), clock_in_at, clock_out_at, tardiness_minutes, created_at
- **tenant_settings** — Configurable system settings
  - Fields: id, setting_key (UNIQUE), setting_value, setting_type (string/number/boolean/time/select), label, description, category (general/rides/staff/operations/notifications/data), updated_at
- **notification_preferences** — Per-user, per-event-type, per-channel notification settings
  - Fields: id, user_id, event_type, channel, enabled, threshold_value, threshold_unit, created_at, updated_at
  - UNIQUE(user_id, event_type, channel)
- **notifications** — In-app notifications
  - Fields: id, user_id, event_type, title, body, metadata (JSONB), read, created_at
- **program_content** — Editable program rules/guidelines
  - Fields: id, rules_html, updated_at

### ID Generation
IDs follow pattern: `prefix_${random}` (e.g., `ride_abc123`, `shift_xyz789`, `driver_xy12ab`, `rider_ab34cd`, `veh_cart1`, `notif_abc123`)

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

## API Endpoints Overview

### Authentication
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/logout` — Logout and destroy session
- `GET /api/auth/me` — Get current user session
- `POST /api/auth/signup` — Rider self-service signup (if enabled)
- `GET /api/auth/signup-allowed` — Check if signup is enabled
- `POST /api/auth/change-password` — Change own password

### Configuration
- `GET /api/tenant-config` — Get tenant branding config (public, accepts `?campus=slug`)
- `GET /api/client-config` — Get isDev flag (public)

### User Management (Office only)
- `GET /api/admin/users` — List all users
- `GET /api/admin/users/search?member_id=...` — Search by member ID
- `POST /api/admin/users` — Create new user
- `PUT /api/admin/users/:id` — Update user
- `DELETE /api/admin/users/:id` — Delete user
- `GET /api/admin/users/:id/profile` — Get user profile with rides
- `POST /api/admin/users/:id/reset-miss-count` — Reset rider's no-show count
- `POST /api/admin/users/:id/reset-password` — Force password reset on next login
- `GET /api/admin/email-status` — Check if email service is configured

### Profile (Self-service)
- `GET /api/me` — Get own profile
- `PUT /api/me` — Update own name/phone

### Employees (Staff only)
- `GET /api/employees` — List all drivers
- `POST /api/employees/clock-in` — Clock in driver
- `POST /api/employees/clock-out` — Clock out driver
- `GET /api/employees/today-status` — Get all drivers with today's clock events and shifts
- `GET /api/employees/:id/tardiness` — Get driver tardiness history and summary (optional `?from=&to=`)

### Shifts (Office only)
- `GET /api/shifts` — List all shifts
- `POST /api/shifts` — Create shift
- `DELETE /api/shifts/:id` — Delete shift

### Rides
- `GET /api/rides` — List all rides (staff only, optional status filter)
- `POST /api/rides` — Create ride request (authenticated users)
- `GET /api/my-rides` — Get own rides (rider only)
- `GET /api/locations` — Get campus location list
- `POST /api/rides/:id/approve` — Approve ride (office only)
- `POST /api/rides/:id/deny` — Deny ride (office only)
- `POST /api/rides/:id/claim` — Claim ride (driver/office)
- `POST /api/rides/:id/on-the-way` — Mark on the way (driver/office)
- `POST /api/rides/:id/here` — Mark arrived, start grace (driver/office)
- `POST /api/rides/:id/complete` — Mark completed (driver/office)
- `POST /api/rides/:id/no-show` — Mark no-show (driver/office, after grace)
- `POST /api/rides/:id/cancel` — Cancel ride (rider: own pending/approved; office: any non-terminal ride)
- `POST /api/rides/:id/unassign` — Remove driver, revert to approved (office only)
- `POST /api/rides/:id/reassign` — Transfer ride to different driver (office only, accepts `{ driverId }`)
- `POST /api/rides/:id/set-vehicle` — Assign vehicle to ride (staff only)
- `POST /api/rides/bulk-delete` — Delete multiple rides (office only, accepts `{ ids: [...] }`)
- `POST /api/rides/purge-old` — Purge terminal rides older than retention period (office only)

### Recurring Rides
- `POST /api/recurring-rides` — Create recurring ride series (rider only)
- `GET /api/recurring-rides/my` — Get own recurring rides (rider only)
- `PATCH /api/recurring-rides/:id` — Update recurring ride status (rider only)

### Vehicles (Staff/Office)
- `GET /api/vehicles` — List all vehicles (optional `?includeRetired=true`)
- `POST /api/vehicles` — Create vehicle (office only)
- `PUT /api/vehicles/:id` — Update vehicle (office only)
- `DELETE /api/vehicles/:id` — Delete vehicle (office only)
- `POST /api/vehicles/:id/retire` — Mark vehicle as retired (office only)
- `POST /api/vehicles/:id/maintenance` — Log maintenance event (office only)
- `GET /api/vehicles/:id/maintenance` — Get maintenance history (staff only)

### Analytics (Office only)
- `GET /api/analytics/tardiness` — Aggregate tardiness stats (optional `?from=&to=`)
- `GET /api/analytics/summary` — Aggregate ride stats
- `GET /api/analytics/hotspots` — Pickup/dropoff frequency heatmap
- `GET /api/analytics/frequency` — Route frequency analysis
- `GET /api/analytics/vehicles` — Vehicle usage metrics
- `GET /api/analytics/milestones` — Milestone badges
- `GET /api/analytics/semester-report` — Long-form semester summary

### Settings (Office only)
- `GET /api/settings` — Get all tenant settings
- `PUT /api/settings` — Bulk-update settings
- `GET /api/settings/public/operations` — Public operations settings (unauthenticated)
- `GET /api/settings/:key` — Get single setting

### Notifications
- `GET /api/notifications` — List notifications (paginated, returns `totalCount`)
- `PUT /api/notifications/read-all` — Mark all as read
- `PUT /api/notifications/:id/read` — Mark single as read
- `POST /api/notifications/bulk-delete` — Delete multiple notifications
- `DELETE /api/notifications/all` — Delete all notifications
- `DELETE /api/notifications/:id` — Delete single notification

### Notification Preferences (Office only)
- `GET /api/notification-preferences` — Get preferences (lazy-seeds defaults)
- `PUT /api/notification-preferences` — Bulk-update preferences

### Program Content
- `GET /api/program-rules` — Get editable rules/guidelines (public)
- `PUT /api/program-rules` — Update rules/guidelines (office only)

### Constants
- `NOTIFICATION_EVENT_TYPES` — 9 event types: driver_tardy, driver_no_clock_in, rider_no_show, rider_approaching_termination, rider_terminated, ride_pending_stale, ride_completed, new_ride_request, daily_summary

### Dev Tools
- `POST /api/dev/seed-rides` — Seed sample rides (office only, disabled in production)

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

## UI Redesign Architecture

The frontend uses a Tabler-based design system.

### CDN Dependencies (do NOT npm install these)
- Tabler CSS: `https://cdn.jsdelivr.net/npm/@tabler/core@1.2.0/dist/css/tabler.min.css`
- Tabler Icons: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.37.1/dist/tabler-icons.min.css`
- FullCalendar: `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.17/index.global.min.js` (office view only)
- DiceBear API: `https://api.dicebear.com/9.x` — client-side avatar generation, no API key needed

### Color System (Three-Layer Theming)
- **Layer 1 — Platform defaults** (in rideops-theme.css :root): SteelBlue #4682B4 primary, Tan #D2B48C accent
- **Layer 2 — Tenant override** (injected by JS from /api/tenant-config): primaryColor, secondaryColor
- **Layer 3 — Campus palette** (campus-themes.js): Per-campus color arrays for charts, dispatch grid, analytics
- **Status colors are semantic and universal** — never overridden per tenant

### CRITICAL: Panel Visibility
rideops-theme.css contains these rules that make navigation work:
```css
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.sub-panel { display: none; }
.sub-panel.active { display: block; }
```

### Icon System
Use Tabler Icons (`ti ti-{name}`), NOT Material Symbols.

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

- Don't add React, Vue, or any frontend framework — keep it vanilla JS
- Don't replace Express with another framework
- Don't change ride status names (referenced across frontend + backend)
- Don't use ES module syntax (`import/export`) — project uses CommonJS
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
