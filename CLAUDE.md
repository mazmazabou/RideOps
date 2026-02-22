# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Web app for USC Transportation's DART (Disabled Access to Road Transportation) service. Provides dispatch (office), driver, and rider interfaces for managing accessible golf-cart rides around the USC campus.

## Tech Stack
- **Backend:** Node.js + Express + express-session + bcryptjs
- **Database:** PostgreSQL (via `pg` pool with connection pooling)
- **Frontend:** Vanilla HTML/CSS/JS (no framework). Multi-page: index.html (office/admin), driver.html, rider.html, login.html, signup.html
- **Auth:** Session-based with bcrypt password hashing. Default password: `dart123`

## Running the Application

```bash
# Start server (port 3000 by default)
node server.js

# Development mode with auto-restart
npx nodemon server.js

# Environment variables
PORT=3000                      # Server port (default: 3000)
DATABASE_URL=postgres://...    # PostgreSQL connection string (default: postgres://localhost/dart_ops)
DISABLE_RIDER_SIGNUP=true      # Disable public rider signup (default: false)
```

Default login credentials (password: `dart123`):
- Office: `office`
- Drivers: `mazen`, `jason`, `jocelin`, `olivia`
- Riders: `sarah`, `tom`

## Key Files

- `server.js` — Express server, all API routes, DB schema init, auth middleware, business logic (~1075 lines)
- `public/app.js` — Main frontend logic for office/admin console (~1543 lines)
- `public/utils.js` — Shared UI utilities: toast, modal, empty state, dev-mode detection (~186 lines)
- `public/usc_building_options.js` — Campus building list for location dropdowns (~304 entries)
- `public/driver.html` — Driver-facing mobile view (self-contained with inline JS/CSS, ~418 lines)
- `public/rider.html` — Rider request form and ride history (self-contained with inline JS/CSS, ~585 lines)
- `public/index.html` — Office/admin console (staff, shifts, rides, dispatch, user management)
- `public/login.html` / `signup.html` — Auth pages
- `public/styles.css` — All CSS including USC brand colors (~687 lines)
- `public/favicon.svg` — USC-themed favicon (cardinal red circle with DT)
- `db/schema.sql` — PostgreSQL schema reference

## Architecture

### Backend Architecture
- All routes defined in `server.js` (~967 lines)
- Database initialization runs on startup (`initDb()` function):
  - Creates tables if they don't exist
  - Runs migrations to add new columns
  - Seeds default users (drivers, office, sample riders)
- Session middleware for authentication
- Role-based access control via middleware: `requireAuth`, `requireOffice`, `requireStaff`, `requireRider`
- Database helpers: `query()`, `generateId()`, `addRideEvent()`, `mapRide()`

### Frontend Architecture
- Frontend uses vanilla JS with `fetch()` to call REST API
- No SPA router — navigation via buttons that show/hide `.page-content` sections
- Each HTML page is self-contained:
  - `index.html` loads `app.js` for office console logic
  - `driver.html` has inline `<script>` for driver interface
  - `rider.html` has inline `<script>` for rider interface
- Polling intervals:
  - Office console: rides refresh every 5s
  - Driver console: data refresh every 3s, grace timers update every 1s
  - Rider console: rides refresh every 5s
- UI utilities in `utils.js` (loaded globally via `<script src="/utils.js">`): `showToast()`, `showConfirmModal()`, `showEmptyState()`, `formatDateTime()`, `resolveDevMode()`, `applyDevOnlyVisibility()` — use these instead of `alert()/confirm()`

## Database Schema

### Tables
- **users** — All users (office, drivers, riders)
  - `role`: 'office', 'driver', or 'rider'
  - `active`: TRUE when driver is clocked in (only for drivers)
  - Fields: id, username, password_hash, name, email, phone, usc_id, role, active
- **shifts** — Weekly schedule for drivers
  - Fields: id, employee_id, day_of_week (1-5 for Mon-Fri), start_time, end_time
- **rides** — All ride requests and their lifecycle
  - Fields: id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id
- **ride_events** — Audit log of all ride status changes
  - Fields: id, ride_id, actor_user_id, type, at (timestamp)
- **recurring_rides** — Templates for recurring weekly ride patterns
  - Fields: id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week (array), start_date, end_date, status
- **rider_miss_counts** — Tracks consecutive no-shows per rider email
  - Fields: email (PK), count

### ID Generation
IDs follow pattern: `prefix_${random}` (e.g., `ride_abc123`, `shift_xyz789`, `driver_xy12ab`, `rider_ab34cd`)

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

## Business Rules (CRITICAL — do not break these)

- **Service hours:** Monday–Friday, 8:00 AM – 7:00 PM ONLY
- **Campus only:** Golf carts cannot leave USC campus (no off-campus destinations)
- **Grace period:** 5 minutes after driver arrives before no-show allowed
- **No-show tracking:**
  - 5 consecutive no-shows = automatic service termination (ride requests blocked)
  - Completed rides reset rider's consecutive miss count to 0
  - Miss count stored per rider email in `rider_miss_counts` table
- **Driver requirements:**
  - Must be clocked in (`active = TRUE`) to claim rides
  - Only approved, unassigned rides can be claimed
  - Only assigned driver (or office) can perform ride actions
- **Ride approval:** Office must check miss count < 5 before approving rides

## User Roles and Permissions

### Office
- Full access to all features
- Manage users (create, edit, delete drivers/riders/office accounts)
- Manage shifts (create, delete schedule blocks)
- Approve/deny ride requests
- View all rides and assign drivers
- Can perform driver actions on any ride
- Access user profiles and ride history

### Driver
- Clock in/out
- View and claim approved rides
- Perform ride actions (on-the-way, here, complete, no-show) for assigned rides
- View campus map
- Edit own profile

### Rider
- Submit one-time ride requests
- Submit recurring ride requests (creates individual rides for each occurrence)
- View own ride history
- Manage recurring ride series (cancel)
- Edit own profile
- Signup disabled by default (controlled via `DISABLE_RIDER_SIGNUP` env var)

## API Endpoints Overview

### Authentication
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/logout` — Logout and destroy session
- `GET /api/auth/me` — Get current user session
- `POST /api/auth/signup` — Rider self-service signup (if enabled)
- `GET /api/auth/signup-allowed` — Check if signup is enabled

### User Management (Office only)
- `GET /api/admin/users` — List all users
- `GET /api/admin/users/search?usc_id=...` — Search by USC ID
- `POST /api/admin/users` — Create new user
- `PUT /api/admin/users/:id` — Update user
- `DELETE /api/admin/users/:id` — Delete user
- `GET /api/admin/users/:id/profile` — Get user profile with rides

### Profile (Self-service)
- `GET /api/me` — Get own profile
- `PUT /api/me` — Update own name/phone

### Employees (Staff only)
- `GET /api/employees` — List all drivers
- `POST /api/employees/clock-in` — Clock in driver
- `POST /api/employees/clock-out` — Clock out driver

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

### Recurring Rides
- `POST /api/recurring-rides` — Create recurring ride series (rider only)
- `GET /api/recurring-rides/my` — Get own recurring rides (rider only)
- `PATCH /api/recurring-rides/:id` — Update recurring ride status (rider only)

### Dev Tools
- `POST /api/dev/seed-rides` — Seed sample rides (office only, disabled in production)

## Code Conventions

- **Module system:** CommonJS (`require`), NOT ES modules (`import/export`)
- **No build step** — edit files directly, refresh browser
- **CSS:** Plain class names, USC brand colors hardcoded as hex
- **Error handling:** Return `{ error: 'message' }` JSON on errors
- **Date/time:** Use ISO 8601 strings, PostgreSQL TIMESTAMPTZ columns
- **Validation:** Server-side validation for all inputs (USC email, service hours, etc.)
- **Security:** Never expose password hashes; sanitize all database queries with parameterized statements

## USC Brand Colors

```css
--cardinal: #990000      /* Primary brand color */
--cardinal-deep: #800000 /* Darker variant */
--gold: #FFCC00          /* Secondary brand color */
--black: #0A0A0A
--white: #FFFFFF
--gray: #767676
```

## Current State

- **Branch:** `claude/dart-operations-console-01CPHo5oRJBKQ5kJAsBTezm1`
- **Main branch:** `main`
- **Uncommitted changes:** Yes — large diff (~3756 insertions) across server.js, app.js, all HTML files, styles.css, plus new files (utils.js, usc_building_options.js, rider.html, signup.html, favicon.svg, CLAUDE.md, tests/)
- **Codebase size:** ~5200 lines total (server.js: 1075, app.js: 1543, styles.css: 687, driver.html: 418, rider.html: 585, utils.js: 186, usc_building_options.js: 304)
- **All features implemented (as of Feb 7, 2026):**
  - Authentication system with login/signup (session-based, bcrypt)
  - Driver mobile view with clock in/out, ride claiming, grace timer
  - Visual schedule grid for shifts (weekly + daily views, drag-to-add)
  - Rider self-service portal with one-time + recurring rides, cancel button
  - Recurring rides functionality with series management
  - User profile management (self-service + admin)
  - Toast notifications, modal dialogs, empty states (shared via utils.js)
  - Dev-only elements hidden via `data-dev-only` attribute + `/api/client-config`
  - Dispatch & Monitoring tab with live driver dashboard, admin override actions (unassign, reassign, cancel), warning banners
  - Ride search/filter on office Rides panel
  - Collapsible rules section
  - Driver urgency indicators (red ≤15min, orange ≤30min)
  - Rider status legend explaining ride statuses
  - Form submission loading states
  - Recurring fields visual container
  - Favicon (SVG) on all pages
  - Accessibility: minimum 12px font sizes
  - USC building options for location dropdowns (304 buildings)
  - Admin user management (create, edit, delete, search by USC ID)
  - Login page: signup link (conditional), gold accent border

## Ride Object Shape (from mapRide in server.js)

Every ride endpoint returns this shape:

```json
{
  "id": "ride_abc123",
  "riderId": "rider1",
  "riderName": "Sarah Student",
  "riderEmail": "hello+sarah@ride-ops.com",
  "riderPhone": "213-555-0111",
  "pickupLocation": "Ethel Percy Andrus Gerontology Center (GER)",
  "dropoffLocation": "Tommy Trojan (TT)",
  "requestedTime": "2026-02-21T14:30:00.000Z",
  "status": "pending",
  "assignedDriverId": null,
  "graceStartTime": null,
  "consecutiveMisses": 0,
  "notes": "",
  "recurringId": null,
  "cancelledBy": null,
  "vehicleId": null
}
```

**IMPORTANT:** There is NO `scheduledTime` field. Rides only have `requestedTime`. The dispatch time-grid positions rides using `requestedTime`.

## Shift Object Shape (from GET /api/shifts)

```json
{
  "id": "shift_abc123",
  "employee_id": "emp1",
  "day_of_week": 1,
  "start_time": "09:00:00",
  "end_time": "17:00:00",
  "created_at": "2026-02-21T00:00:00.000Z"
}
```

`day_of_week`: 1=Monday through 5=Friday (SMALLINT).

## UI Redesign Architecture (Active)

The frontend is being migrated to a Tabler-based design system. Key rules:

### CDN Dependencies (do NOT npm install these)
- Tabler CSS: `https://cdn.jsdelivr.net/npm/@tabler/core@1.2.0/dist/css/tabler.min.css`
- Tabler Icons: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/tabler-icons.min.css`
- FullCalendar: `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.17/index.global.min.js` (office view only)

### New Files
- `public/css/rideops-theme.css` — All CSS custom properties, component styles, layout classes. Every color must be a CSS variable from this file — never hardcode hex values in HTML or JS.
- `public/js/rideops-utils.js` — Shared utilities: `applyTenantTheme()`, `statusBadge()`, `showToastNew()`, `showModalNew()`, `openDrawer()`, `closeDrawer()`, `initSidebar()`, `toggleSidebar()`, `initSubTabs()`, `initBottomTabs()`, `formatTime()`, `formatDate()`, `formatDateTime()`, `timeAgo()`, `showTab()`

### CRITICAL: Panel Visibility
rideops-theme.css contains these rules that make navigation work:
```css
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.sub-panel { display: none; }
.sub-panel.active { display: block; }
```
If you restructure HTML, you MUST keep `.tab-panel` and `.sub-panel` classes on panel elements. The previous UI rewrite (commit f5fa87d) broke entirely because these rules were missing.

### Icon System
Use Tabler Icons (`ti ti-{name}`), NOT Material Symbols. Example: `<i class="ti ti-broadcast"></i>`

### Color System (Two-Layer Theming)
- **Layer 1 — Platform defaults** (in rideops-theme.css :root): SteelBlue #4682B4 primary, Tan #D2B48C accent
- **Layer 2 — Tenant override** (injected by JS from /api/tenant-config): primaryColor, secondaryColor
- **Status colors are semantic and universal** — never overridden per tenant:
  - pending=#94A3B8, approved=#3B82F6, scheduled=#6366F1, on_the_way=#F59E0B
  - grace=#06B6D4, completed=#10B981, no_show=#EF4444, denied=#EF4444, cancelled=#6B7280
- **Sidebar background (#1E2B3A)** — never changes per tenant

### Layout Patterns
- **Office view (index.html):** `.ro-shell` grid with fixed sidebar (220px, collapsible to 56px) + scrollable main content
- **Driver view (driver.html):** Mobile-first, no sidebar, `.ro-bottom-tabs` bottom tab bar
- **Rider view (rider.html):** Mobile-first, no sidebar, `.ro-bottom-tabs` bottom tab bar

### Status Names (immutable — referenced across entire codebase)
pending, approved, scheduled, driver_on_the_way, driver_arrived_grace, completed, no_show, denied, cancelled

## What NOT to Do

- Don't add React, Vue, or any frontend framework — keep it vanilla JS
- Don't replace Express with another framework
- Don't change ride status names (referenced across frontend + backend)
- Don't use ES module syntax (`import/export`) — project uses CommonJS
- Don't remove business rule validations (service hours, 5 no-shows, grace period, etc.)
- Don't expose sensitive data (password hashes, tokens) in API responses
- Don't skip server-side validation — never trust client input
- Don't hardcode hex colors in HTML or JS — use CSS custom properties from rideops-theme.css
- Don't use Material Symbols — use Tabler Icons (ti ti-*)
- Don't npm install Tabler, FullCalendar, or any CDN dependency — load from CDN only
- Don't modify server.js during frontend redesign phases (except PUT /api/shifts/:id already added)
- Don't rewrite app.js from scratch — make targeted edits to update DOM selectors
- Don't remove `.tab-panel` / `.sub-panel` CSS classes from panel elements
- Don't create one giant commit — work incrementally, verify each step with Playwright
