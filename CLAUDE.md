# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
RideOps is an accessible campus transportation operations platform. It provides dispatch (office), driver, and rider interfaces for managing golf-cart rides around campus. The platform supports multi-tenant configuration — different organizations can customize branding, locations, and rules via tenant config files.

## Tenant Configuration
- **Default (no TENANT_FILE):** Generic "RideOps" branding with platform blue (#4682B4), 32 generic campus locations
- **USC DART (TENANT_FILE=tenants/usc-dart.json):** USC-specific branding (#990000), 304 USC buildings, USC-specific rules
- Tenant config loaded via `loadTenantConfig()` in server.js, merged with `DEFAULT_TENANT`
- Frontend pages fetch `/api/tenant-config` to apply dynamic branding (org name, colors, ID field labels)

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

## Tech Stack
- **Backend:** Node.js + Express + express-session + bcryptjs
- **Database:** PostgreSQL (via `pg` pool with connection pooling)
- **Frontend:** Vanilla HTML/CSS/JS (no framework). Multi-page: index.html (office/admin), driver.html, rider.html, login.html, signup.html
- **Auth:** Session-based with bcrypt password hashing. Default password: `demo123`

## Running the Application

```bash
# Start server (port 3000 by default)
node server.js

# Development mode with auto-restart
npx nodemon server.js

# With USC DART tenant
TENANT_FILE=tenants/usc-dart.json node server.js

# Demo mode
DEMO_MODE=true node server.js

# Environment variables
PORT=3000                      # Server port (default: 3000)
DATABASE_URL=postgres://...    # PostgreSQL connection string (default: postgres://localhost/rideops)
TENANT_FILE=tenants/usc-dart.json  # Tenant config file path (optional)
DISABLE_RIDER_SIGNUP=true      # Disable public rider signup (default: false)
```

Default login credentials (password: `demo123`):
- Office: `office`
- Drivers: `alex`, `jordan`, `taylor`, `morgan`
- Riders: `casey`, `riley`

## Key Files

- `server.js` — Express server, all API routes, DB schema init, auth middleware, tenant loading, business logic
- `public/app.js` — Main frontend logic for office/admin console
- `public/utils.js` — Shared UI utilities: toast, modal, empty state, dev-mode detection
- `public/js/rideops-utils.js` — Shared UI utilities: `statusBadge()`, `showToastNew()`, `showModalNew()`, `initSidebar()`, `initBottomTabs()`, `formatTime()`, `formatDate()`
- `public/css/rideops-theme.css` — All CSS custom properties, component styles, layout classes
- `public/driver.html` — Driver-facing mobile view (self-contained with inline JS/CSS)
- `public/rider.html` — Rider request form and ride history (self-contained with inline JS/CSS)
- `public/index.html` — Office/admin console (staff, shifts, rides, dispatch, analytics, user management)
- `public/login.html` / `signup.html` — Auth pages
- `public/demo.html` — Demo mode role picker
- `public/styles.css` — **DEPRECATED** — no longer loaded by any page, kept for reference only
- `tenants/usc-dart.json` — USC DART tenant configuration
- `tenants/usc-buildings.js` — 304 USC campus locations
- `tenants/default-locations.js` — 32 generic campus locations (default when no tenant)
- `email.js` — Email sending (nodemailer) with tenant-aware brand colors
- `demo-seed.js` — Seeds demo data for the demo mode flow
- `public/favicon.svg` — RideOps favicon (blue circle with RO)
- `db/schema.sql` — PostgreSQL schema reference

## Architecture

### Backend Architecture
- All routes defined in `server.js`
- Tenant configuration: `loadTenantConfig()` reads `TENANT_FILE` env var, merges with `DEFAULT_TENANT`
- Campus locations loaded from tenant's `locationsFile` or `./tenants/default-locations`
- Database initialization runs on startup (`initDb()` function):
  - Creates tables if they don't exist
  - Runs migrations (including `usc_id` → `member_id` rename)
  - Seeds default users (drivers, office, sample riders)
- Session middleware for authentication
- Role-based access control via middleware: `requireAuth`, `requireOffice`, `requireStaff`, `requireRider`
- Database helpers: `query()`, `generateId()`, `addRideEvent()`, `mapRide()`

### Frontend Architecture
- Frontend uses vanilla JS with `fetch()` to call REST API
- No SPA router — navigation via buttons that show/hide `.tab-panel` sections
- Each HTML page is self-contained:
  - `index.html` loads `app.js` for office console logic
  - `driver.html` has inline `<script>` for driver interface
  - `rider.html` has inline `<script>` for rider interface
- Tenant theming: pages fetch `/api/tenant-config` and apply dynamic branding
- Polling intervals:
  - Office console: rides refresh every 5s
  - Driver console: data refresh every 3s, grace timers update every 1s
  - Rider console: rides refresh every 5s

## Database Schema

### Tables
- **users** — All users (office, drivers, riders)
  - `role`: 'office', 'driver', or 'rider'
  - `active`: TRUE when driver is clocked in (only for drivers)
  - Fields: id, username, password_hash, name, email, phone, member_id, role, active
- **shifts** — Weekly schedule for drivers
  - Fields: id, employee_id, day_of_week (0-4 for Mon-Fri), start_time, end_time
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
- **Campus only:** Golf carts cannot leave campus (no off-campus destinations)
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

## API Endpoints Overview

### Authentication
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/logout` — Logout and destroy session
- `GET /api/auth/me` — Get current user session
- `POST /api/auth/signup` — Rider self-service signup (if enabled)
- `GET /api/auth/signup-allowed` — Check if signup is enabled

### Configuration
- `GET /api/tenant-config` — Get tenant branding config (public)
- `GET /api/client-config` — Get isDev flag (public)

### User Management (Office only)
- `GET /api/admin/users` — List all users
- `GET /api/admin/users/search?member_id=...` — Search by member ID
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
- **CSS:** CSS custom properties from `rideops-theme.css`, Tabler Icons (`ti ti-*`)
- **Error handling:** Return `{ error: 'message' }` JSON on errors
- **Date/time:** Use ISO 8601 strings, PostgreSQL TIMESTAMPTZ columns
- **Validation:** Server-side validation for all inputs (member ID via tenant pattern, service hours, etc.)
- **Security:** Never expose password hashes; sanitize all database queries with parameterized statements
- **Branding:** Never hardcode org-specific text (USC, DART, etc.) — use tenant config. Default to "RideOps"

## UI Redesign Architecture

The frontend uses a Tabler-based design system.

### CDN Dependencies (do NOT npm install these)
- Tabler CSS: `https://cdn.jsdelivr.net/npm/@tabler/core@1.2.0/dist/css/tabler.min.css`
- Tabler Icons: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.37.1/dist/tabler-icons.min.css`
- FullCalendar: `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.17/index.global.min.js` (office view only)

### Color System (Two-Layer Theming)
- **Layer 1 — Platform defaults** (in rideops-theme.css :root): SteelBlue #4682B4 primary, Tan #D2B48C accent
- **Layer 2 — Tenant override** (injected by JS from /api/tenant-config): primaryColor, secondaryColor
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
- Don't hardcode organization-specific text — use tenant config, default to "RideOps"
- Don't remove `.tab-panel` / `.sub-panel` CSS classes from panel elements
