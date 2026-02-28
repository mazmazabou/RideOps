# RideOps

Accessible campus transportation operations platform.

## Overview

RideOps is a web app for managing accessible ride services on college campuses. It provides dispatch (office), driver, and rider interfaces for coordinating golf-cart transportation. The platform supports multi-tenant configuration with campus-specific branding, locations, color themes, and org-scoped URLs.

**Supported Campuses:**
| Campus | Slug | Org Name | Primary Color |
|--------|------|----------|---------------|
| Default | _(none)_ | RideOps | #4682B4 (SteelBlue) |
| USC | `/usc` | USC DART | #990000 (Cardinal) |
| Stanford | `/stanford` | Stanford ATS | #8C1515 (Cardinal Red) |
| UCLA | `/ucla` | UCLA BruinAccess | #2774AE (UCLA Blue) |
| UC Irvine | `/uci` | UCI AnteaterExpress | #0064A4 (UCI Blue) |

## Quick Start

```bash
npm install
node server.js
```

Server runs on `http://localhost:3000` by default.

**Default credentials** (password: `demo123`):
- Office: `office`
- Drivers: `alex`, `jordan`, `taylor`, `morgan`
- Riders: `casey`, `riley`

## Demo Mode

```bash
DEMO_MODE=true node server.js
```

Seeds 650+ historical rides, 5 weeks of shifts, clock events with tardiness data, recurring rides, fleet vehicles, and notifications. Access the demo role picker at `/demo.html`.

## Org-Scoped URLs

Each campus has dedicated URL paths that apply campus-specific branding and configuration:

```
/usc              → USC DART office console
/usc/driver       → USC driver view
/usc/rider        → USC rider view
/usc/signup       → USC rider signup

/stanford         → Stanford ATS office console
/ucla             → UCLA BruinAccess office console
/uci              → UCI AnteaterExpress office console
```

Legacy routes (`/office`, `/driver`, `/rider`) still work with default RideOps branding.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `postgres://localhost/rideops` | PostgreSQL connection |
| `TENANT_FILE` | _(none)_ | Path to tenant JSON config |
| `DEMO_MODE` | `false` | Enable demo mode with sample data |
| `DISABLE_RIDER_SIGNUP` | `false` | Disable public rider registration |
| `SMTP_HOST` | _(none)_ | SMTP server (optional — falls back to console) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | _(none)_ | SMTP username |
| `SMTP_PASS` | _(none)_ | SMTP password |
| `NOTIFICATION_FROM` | `noreply@ride-ops.com` | Notification sender address |

## Features

### Office Console
- **Dispatch Board** — Real-time driver grid with shift bands, ride strips, drag-and-drop
- **Rides Management** — Table + calendar views, multi-select filter pills, bulk select/delete, CSV export
- **Staff & Shifts** — Weekly schedule editor, clock-in/out tracking, tardiness monitoring
- **Fleet Management** — Vehicle CRUD, maintenance logging, mileage tracking, retire/reactivate
- **Analytics** — Ride volume, tardiness trends, hotspot heatmaps, route frequency, vehicle usage, milestones
- **Campus Map** — Embedded campus map per tenant
- **Settings** — Configurable service hours, no-show rules, notification preferences, data retention/purge
- **User Management** — CRUD users, bulk select/delete, password reset, miss count reset
- **Notifications** — In-app notification drawer with bulk select/delete, clear all, mark read
- **Program Content** — Editable rules/guidelines (rich text)

### Driver Interface
- Mobile-optimized view for claiming rides, navigation flow (On My Way → Arrived → Complete/No-Show)
- Clock-in/out, shift display, grace period timers

### Rider Interface
- Request rides, view ride history, recurring ride templates
- Self-service signup (when enabled)

## Tech Stack

- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS (no framework), Tabler CSS + Icons (CDN)
- **Auth:** Session-based with bcrypt password hashing
- **Email:** Nodemailer (optional SMTP)
- **Avatars:** DiceBear API (client-side, no key needed)
- **Calendar:** FullCalendar (CDN, office view only)

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | All users (office, drivers, riders) with roles and profiles |
| `shifts` | Weekly driver schedules (recurring or week-specific) |
| `rides` | Ride requests and full lifecycle tracking |
| `ride_events` | Audit log of all ride status changes |
| `recurring_rides` | Templates for recurring weekly ride patterns |
| `rider_miss_counts` | Consecutive no-show tracking per rider email |
| `vehicles` | Fleet inventory with status, type, mileage |
| `maintenance_logs` | Vehicle service history |
| `clock_events` | Driver clock-in/out with tardiness minutes |
| `tenant_settings` | Configurable system settings (14+ keys) |
| `notification_preferences` | Per-user notification rules by event type and channel |
| `notifications` | In-app notification storage |
| `program_content` | Editable program rules/guidelines |

## Ride Status Flow

```
pending → approved → scheduled → driver_on_the_way → driver_arrived_grace → completed
             ↓                                                                   ↓
           denied                                                             no_show
```

Riders can cancel pending/approved rides. Office can cancel any non-terminal ride.

## Tenant Configuration

Set `TENANT_FILE` to load organization-specific branding, locations, and rules:

```bash
TENANT_FILE=tenants/usc-dart.json node server.js
```

### Tenant Config Files

| File | Purpose |
|------|---------|
| `tenants/usc-dart.json` | USC DART branding, colors, USC buildings, rules |
| `tenants/campus-configs.js` | Server-side campus configs for all 4 campuses |
| `tenants/usc-buildings.js` | 304 USC campus locations |
| `tenants/stanford-locations.js` | 25 Stanford campus locations |
| `tenants/ucla-locations.js` | 25 UCLA campus locations |
| `tenants/uci-locations.js` | 25 UCI campus locations |
| `tenants/default-locations.js` | 32 generic campus locations (default) |

## Project Structure

```
server.js                    — Express server, all API routes, DB init, auth, business logic
email.js                     — Nodemailer email sending with tenant-aware branding
notification-service.js      — Notification dispatch engine
demo-seed.js                 — Demo mode data seeder (650+ rides, shifts, clock events)

public/
  index.html                 — Office/admin console
  app.js                     — Office console logic (~5000 lines)
  driver.html                — Driver mobile view (self-contained)
  rider.html                 — Rider view (self-contained)
  login.html / signup.html   — Auth pages
  demo.html                  — Demo mode role picker
  campus-themes.js           — Per-campus color palettes for charts/UI
  demo-config.js             — Demo mode configuration
  js/rideops-utils.js        — Shared utilities (badges, toasts, modals, sidebar, notifications)
  css/rideops-theme.css      — All CSS custom properties, component styles, layout classes

tenants/
  campus-configs.js          — Server-side campus branding configs
  usc-dart.json              — USC DART tenant config
  usc-buildings.js           — 304 USC locations
  stanford-locations.js      — 25 Stanford locations
  ucla-locations.js          — 25 UCLA locations
  uci-locations.js           — 25 UCI locations
  default-locations.js       — 32 generic locations
```

## License

Proprietary.
