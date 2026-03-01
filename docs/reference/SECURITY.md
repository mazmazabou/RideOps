# RideOps Security Overview

This document describes the security architecture and data protection practices implemented in RideOps. It is intended for university IT security teams evaluating the platform for deployment.

## Authentication & Session Management

### Password Security
- Passwords are hashed using **bcrypt** with a cost factor of 10
- All hashing operations are asynchronous (non-blocking)
- Minimum password length enforced at 8 characters across all flows (signup, change password, admin reset)
- First-login password change can be enforced per user (`must_change_password` flag)
- Password hashes are never exposed in API responses

### Session Management
- Server-side sessions using **express-session**
- Session store backed by **PostgreSQL** via `connect-pg-simple` — no in-memory session storage
- Session cookies configured with:
  - `HttpOnly: true` — prevents JavaScript access
  - `Secure: true` in production — cookies sent only over HTTPS
  - `SameSite: lax` — CSRF mitigation
- Configurable session secret via `SESSION_SECRET` environment variable
- Production deployment requires `SESSION_SECRET` to be explicitly set (server refuses to start without it)
- `trust proxy` enabled for correct client IP detection behind load balancers

### Rate Limiting
- Login endpoint: **10 requests per 15 minutes** per IP
- Signup endpoint: **5 requests per 15 minutes** per IP
- Implemented via `express-rate-limit` middleware
- Returns `429 Too Many Requests` with retry-after header

### Role-Based Access Control
Four access levels enforced via Express middleware:

| Middleware | Access Level | Routes |
|------------|-------------|--------|
| `requireAuth` | Any authenticated user | Ride creation, profile, notifications |
| `requireRider` | Rider role only | Recurring rides, rider-specific views |
| `requireStaff` | Office + Driver | Ride management, employee actions, vehicle queries |
| `requireOffice` | Office role only | Admin, settings, analytics, user management, approvals |

All authorization checks are server-side. Frontend role checks are for UI display only and do not constitute access control.

## Data Protection

### Database Security
- All SQL queries use **parameterized statements** ($1, $2, ...) — no string interpolation or concatenation
- 99 API endpoints, all using parameterized queries
- Connection pooling via `pg.Pool` with configurable SSL (`PGSSLMODE=require` for encrypted connections)
- 13 database indexes for query performance (rides, ride_events, shifts, clock_events, notifications)

### Transaction Integrity
Multi-step operations are wrapped in database transactions (`BEGIN`/`COMMIT`/`ROLLBACK`):
- Ride no-show processing (status update + miss count increment + notification)
- Ride completion (status update + miss count reset)
- Ride cancellation (status update + event logging)
- Ride approval (miss count check + status update)
- Ride claiming (status update + driver assignment)

A server crash mid-operation will not leave data in an inconsistent state.

### Input Validation
- All user inputs validated server-side before database operations
- Email format validation on ride requests and signup
- Member ID validated against tenant-specific patterns (regex, max length)
- Service hours enforcement prevents ride requests outside operating windows
- Ride status transitions enforced — only valid state changes are accepted

### XSS Prevention
- Program rules/guidelines content (user-editable HTML) is sanitized:
  - `<script>` tags stripped
  - `on*` event handler attributes stripped (onclick, onerror, onload, etc.)
  - `javascript:` protocol URLs stripped
- API responses return JSON — no server-side HTML rendering with user data
- Frontend uses `textContent` for user-generated strings in critical UI components

### Data Retention
- Configurable retention policy via `ride_retention_value` and `ride_retention_unit` settings
- Office administrators can purge terminal rides (completed, denied, cancelled, no-show) older than the retention period
- Manual purge via dedicated endpoint — no silent background deletion
- Ride events (audit trail) are purged alongside their parent rides

## Infrastructure Security

### Health Monitoring
- `GET /health` endpoint returns database connectivity status (unauthenticated)
- Suitable for load balancer health checks and uptime monitoring
- Returns `200 OK` with `{ status: 'healthy', database: 'connected' }` on success
- Returns `503 Service Unavailable` on database connection failure

### Graceful Shutdown
- SIGTERM and SIGINT signal handlers implemented
- In-flight HTTP requests are allowed to complete
- Database connection pool is drained before process exit
- 15-second forced shutdown timeout prevents indefinite hangs

### Startup Recovery
- On server restart, rides stuck in transient driver states (`driver_on_the_way`, `driver_arrived_grace`) are automatically reverted to `scheduled`
- All driver clock-in states are reset on restart
- Recovery actions are logged with `system_recovery` audit events

### Deployment Security
- Single `SESSION_SECRET` environment variable controls session encryption
- No secrets in source code — all sensitive configuration via environment variables
- No third-party analytics, tracking pixels, or external JavaScript (except CDN CSS/icons)
- Frontend assets are static files — no server-side template injection surface

## Compliance Considerations

### FERPA Alignment
RideOps stores the minimum student data necessary for ride operations:
- Name, email, phone number, member/student ID
- Ride request history and status
- No academic records, grades, financial information, or health data beyond what riders voluntarily provide in ride notes

Data handling practices align with FERPA requirements:
- No third-party data sharing
- Server-side session storage only
- Configurable data retention and purge
- Role-based access prevents riders from seeing other riders' data
- Audit trail via ride_events table

Formal FERPA compliance certification is available through institutional review. RideOps provides the technical controls; the deploying institution manages the compliance process.

### Accessibility
- Built on Tabler CSS, a WCAG-aligned component library
- Semantic HTML structure across all views
- Mobile-responsive design optimized for driver and rider field use
- High-contrast status colors for ride lifecycle visualization
- Full VPAT / Section 508 accessibility audit is planned

## Planned Enhancements

The following security features are on the product roadmap:

| Feature | Status | Description |
|---------|--------|-------------|
| SSO / SAML Integration | Planned | University single sign-on support (Shibboleth, Azure AD, Okta) |
| Two-Factor Authentication | Planned | TOTP-based 2FA for office administrators |
| API Key Authentication | Planned | Service account access for integrations |
| Audit Log Export | Planned | Exportable audit trail for compliance reporting |
| SOC 2 Type II | Roadmap | Formal security certification preparation |
| VPAT / Section 508 | Planned | Full accessibility compliance audit |

## Questions

For security-specific questions or to request a detailed technical review, contact the RideOps team.
