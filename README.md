# RideOps

Accessible campus transportation operations platform.

## Overview

RideOps is a web app for managing accessible ride services on college campuses. It provides dispatch (office), driver, and rider interfaces for coordinating golf-cart transportation.

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

## Tenant Configuration

RideOps supports multi-tenant configuration. Set `TENANT_FILE` to load organization-specific branding, locations, and rules.

```bash
# Generic RideOps defaults (no env var needed)
node server.js

# USC DART tenant
TENANT_FILE=tenants/usc-dart.json node server.js

# Demo mode with sample data
DEMO_MODE=true node server.js
```

### Tenant Config Files

| File | Purpose |
|------|---------|
| `tenants/usc-dart.json` | USC DART branding, colors, USC buildings, rules |
| `tenants/usc-buildings.js` | 304 USC campus locations |
| `tenants/default-locations.js` | 32 generic campus locations (used when no tenant) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `postgres://localhost/rideops` | PostgreSQL connection |
| `TENANT_FILE` | _(none)_ | Path to tenant JSON config |
| `DEMO_MODE` | `false` | Enable demo mode with sample data |
| `DISABLE_RIDER_SIGNUP` | `false` | Disable public rider registration |

## Tech Stack

- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Auth:** Session-based with bcrypt password hashing
