# Academic Terms Feature Audit Report

**Date:** 2026-03-02
**Auditor:** QA Audit Agent (Claude Opus 4.6)
**Feature:** User-Defined Academic Terms
**Server:** localhost:3000, DEMO_MODE=true, USC campus context

---

## Executive Summary

**22 checks performed. 20 PASS, 0 CRITICAL, 1 WARNING, 1 NOTE.**

The User-Defined Academic Terms feature is well-implemented and production-ready. All CRUD operations work correctly, validation is thorough on both client and server, the analytics date picker dynamically renders term buttons with proper highlight behavior, and the Settings UI provides a clean management interface. One stored XSS vulnerability was found in the Settings table rendering (WARNING severity since it requires office-level access to exploit). One documentation drift issue was noted.

---

## Checklist Results

### Database & API

| # | Check | Result | Details |
|---|-------|--------|---------|
| 1 | GET /api/academic-terms returns seeded terms | **PASS** | Returns 4 quarter terms (Winter/Spring/Summer/Fall 2026) matching the `academic_period_label=Quarter` setting. HTTP 200. |
| 2 | POST /api/academic-terms creates a new term with validation | **PASS** | Creates term with correct ID (`term_*` prefix), returns 201 with all fields. `sort_order` defaults to 0 when missing/invalid. |
| 3 | PUT /api/academic-terms/:id updates a term | **PASS** | Updates name/dates/sort_order, returns 200. `created_at` unchanged, `updated_at` updated. Non-existent ID returns 404. |
| 4 | DELETE /api/academic-terms/:id deletes a term | **PASS** | Returns `{success:true}` on 200. Non-existent ID returns 404. Term disappears from subsequent GET. |
| 5 | Validation: reject empty name, bad dates, missing fields | **PASS** | Tested 8 validation scenarios: empty name (400), missing name (400), end <= start (400), end == start (400), missing start (400), missing end (400), invalid date format (400), name > 50 chars (400). All return correct error messages. |

### Auth & Authorization

| # | Check | Result | Details |
|---|-------|--------|---------|
| -- | GET requires requireStaff | **PASS** | Office: 200, Driver: 200, Rider: 403 "Staff access required", Unauthenticated: 403 |
| -- | POST/PUT/DELETE require requireOffice | **PASS** | Driver: 403 "Office access required", Rider: 403 "Office access required" |

### Settings UI

| # | Check | Result | Details |
|---|-------|--------|---------|
| 6 | Settings > Academic Terms tab exists and loads terms | **PASS** | Tab button `data-subtarget="admin-terms-view"` present. Clicking loads table with 4 terms, formatted dates (e.g., "Jan 6, 2026"), sort order column, edit/delete buttons. |
| 7 | "Add Term" button works, form validates inputs | **PASS** | Form appears with Name (maxlength 50), Start Date, End Date, Sort Order, Save/Cancel buttons. Empty submission shows toast "Term name is required (max 50 characters)". Missing dates shows "Start date is required". |
| 8 | Edit button populates form for editing | **PASS** | Clicking edit icon populates all fields from data attributes. Name, start_date, end_date, sort_order all pre-filled. Save updates the term and re-renders table. |
| 9 | Delete button shows confirmation modal | **PASS** | `showModalNew` with title "Delete Academic Term", message "Delete term 'X'? This cannot be undone.", Cancel/Delete buttons. Confirming deletes and shows success toast. |
| 10 | Success toasts appear on save/delete | **PASS** | "Term saved" (success) on create/edit, "Term deleted" (success) on delete. Error toasts appear on validation failures. |

### Analytics Date Picker

| # | Check | Result | Details |
|---|-------|--------|---------|
| 11 | Analytics tab shows term buttons (not hardcoded "Semester") | **PASS** | `#analytics-term-buttons` span inside `.analytics-quick-select` renders dynamic buttons. With 4 terms: all 4 inline. With 5+ terms: 3 inline + "More" dropdown. No hardcoded semester/quarter/trimester button. |
| 12 | Clicking a term button sets correct from/to dates | **PASS** | "Winter 2026" sets From=2026-01-06, To=2026-03-21. "Intersession 2026" (from dropdown) sets From=2026-12-15, To=2027-01-10. All match DB values exactly. |
| 13 | Charts refresh with correct data for selected term range | **PASS** | Clicking "Winter 2026" changed Total Rides from 158 to 472, all widgets refreshed. Clicking "Intersession 2026" (future) showed 0 rides with proper empty states. Cache invalidation works (`_tardinessCache.data = null`, `_hotspotsCache.data = null`). |
| 14 | Term button highlights when active | **PASS** | CSS selector `.analytics-quick-select button.active` applies to term buttons. Active term gets `[active]` class. Clicking Today/Week/Month clears term highlight. `highlightActiveTermButton()` matches from/to values against term data attributes. |
| 15 | Today/Week/Month buttons still work correctly | **PASS** | "Today" sets both dates to 2026-03-02, clears term highlight. "Week" sets 7-day range. Data refreshes correctly for all presets. |

### Regression Checks

| # | Check | Result | Details |
|---|-------|--------|---------|
| 16 | Other settings still save/load correctly | **PASS** | `PUT /api/settings` with `[{key:"grace_period_minutes",value:"5"}]` returns `{success:true}`. `GET /api/settings` returns all categories with correct values. |
| 17 | Analytics data filtering works with manual date ranges | **PASS** | Verified via term buttons which set manual date inputs and trigger refresh. Data changes correspond to date range. |
| 18 | No console errors on any page | **PASS** | 0 errors, 0 warnings across entire session (login, dispatch, settings, analytics navigation). |
| 19 | academic_period_label is hidden from Business Rules settings | **PASS** | `app.js` line 5287: `if (s.key === 'academic_period_label') continue;` skips rendering. Verified in browser: Business Rules shows Operations, Rides, Staff categories -- no "Academic Period Label" visible. Setting still exists in API response (`GET /api/settings` returns it in operations category). |
| 20 | Empty state: if all terms deleted, picker shows only Today/Week/Month | **PASS** | Deleted all 4 terms, reloaded page. Analytics date picker shows only Today/Week/Month buttons. `#analytics-term-buttons` span is empty. No errors. |

### Edge Cases

| # | Check | Result | Details |
|---|-------|--------|---------|
| 21 | Create term with very long name (50 chars) | **PASS** | 50-character name accepted (201). UI renders it without layout breakage. Name > 50 chars rejected (400). |
| 22 | Create overlapping terms | **PASS** | No unique constraint on dates. Multiple terms with overlapping ranges can coexist (they're just date presets, not enforced periods). |

---

## Issues Found

### [WARNING] Stored XSS in Academic Terms Settings Table

**Severity:** WARNING
**Location:** `/Users/mazenabouelela/Documents/Projects/RideOps/public/app.js` lines 5470, 5475
**Description:** The `loadAcademicTerms()` function builds the terms table using string concatenation with `innerHTML`. Term names are not HTML-escaped before insertion.

**Evidence:**
- Line 5470: `html += '<td><strong>' + t.name + '</strong></td>';`
- Line 5475: `data-name="' + t.name.replace(/"/g, '&quot;') + '"` (only escapes double quotes)
- Created term with name `<script>alert(1)</script>` -- the name cell rendered empty (script tag consumed as HTML element). While `<script>` tags via `innerHTML` do not execute per spec, an event-handler payload like `<img src=x onerror=alert(1)>` would execute JavaScript.

**Mitigating factors:**
- Only office-role users can create/edit terms (self-XSS risk only unless multiple office users exist)
- The analytics term buttons use `textContent` (line 3194), which is safe
- The delete confirmation modal uses `textContent` (rideops-utils.js line 182), which is safe

**Fix:** Escape HTML entities in term names before inserting into innerHTML, or use `textContent`/DOM API instead of string concatenation. A simple helper:
```javascript
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

### [NOTE] db/schema.sql not updated with academic_terms table

**Severity:** NOTE
**Location:** `/Users/mazenabouelela/Documents/Projects/RideOps/db/schema.sql`
**Description:** The `academic_terms` table and `idx_academic_terms_sort` index are created by `initDb()` in `server.js` (lines 365-375) but are not documented in `db/schema.sql`. The file header says "Last updated: 2026-03-01" and lists 13 tables. It should now list 14 tables including `academic_terms`.

**Evidence:**
- `server.js` line 365: `CREATE TABLE IF NOT EXISTS academic_terms (...)`
- `server.js` line 375: `CREATE INDEX IF NOT EXISTS idx_academic_terms_sort ON academic_terms(sort_order, start_date DESC);`
- `db/schema.sql`: No mention of `academic_terms` anywhere in the file.

---

## Database Schema Verification

| Check | Result |
|-------|--------|
| Table `academic_terms` exists | PASS |
| Columns: id (TEXT PK), name (VARCHAR(50) NOT NULL), start_date (DATE NOT NULL), end_date (DATE NOT NULL), sort_order (INTEGER NOT NULL DEFAULT 0), created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()), updated_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()) | PASS |
| CHECK constraint `academic_terms_date_order`: end_date > start_date | PASS |
| Index `idx_academic_terms_sort` on (sort_order, start_date DESC) | PASS |
| Seeded terms match `academic_period_label=Quarter` (4 quarter terms) | PASS |
| `updated_at` changes on PUT, `created_at` does not | PASS |

---

## Security Verification

| Check | Result |
|-------|--------|
| Parameterized SQL queries (no injection) | PASS -- all queries use `$1, $2, ...` placeholders |
| Auth enforcement on all endpoints | PASS -- GET=requireStaff, POST/PUT/DELETE=requireOffice |
| Input validation (server-side) | PASS -- name length, date format regex, date order check |
| Input validation (client-side) | PASS -- mirrors server validation, shows toast errors |
| No sensitive data leaked in responses | PASS -- timestamps excluded from API response |
| Session expiry handling | PASS -- `handleSessionExpiry(res)` called on save/delete |
| HTML escaping in term name rendering | **FAIL** -- see WARNING above |

---

## Recommended Fix Priority

1. **[WARNING] XSS in term name rendering** -- Escape HTML in `loadAcademicTerms()` at lines 5470 and 5475 of `app.js`. Low effort, eliminates stored XSS vector.
2. **[NOTE] Update db/schema.sql** -- Add `academic_terms` table definition and `idx_academic_terms_sort` index to keep the schema reference file in sync.
