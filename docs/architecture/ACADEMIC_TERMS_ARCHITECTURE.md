# Architecture: User-Defined Academic Terms

**Status:** Draft
**Date:** 2026-03-02
**Requirements:** [ACADEMIC_TERMS_REQUIREMENTS.md](./ACADEMIC_TERMS_REQUIREMENTS.md)

---

## 1. Overview

**Purpose:** Replace the hardcoded `academic_period_label` setting with a new `academic_terms` table that lets admins define named date ranges. These terms appear as quick-select buttons in the analytics date picker.

**Key Architectural Decisions:**
1. New `academic_terms` table (not a JSON blob in `tenant_settings`) for proper querying, indexing, and CRUD.
2. Hard delete (not soft-delete) -- consistent with all existing tables in the codebase. No table in RideOps uses a `deleted_at` column.
3. Global scope -- terms are not campus-specific. All campuses share terms.
4. `academic_period_label` setting remains in DB but is hidden from the Settings UI and ignored by the analytics picker.

**Assumptions:**
- Typical deployment will have 3-12 terms (1-4 years of academic calendars).
- No pagination needed for the terms list.
- No concurrent editing conflicts expected (single office admin manages terms).

---

## 2. Database Schema

### 2.1 New Table: `academic_terms`

```sql
CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_terms_date_order CHECK (end_date > start_date)
);
```

**Column Details:**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | Format: `term_abc12345` via `generateId('term')` |
| `name` | VARCHAR(50) | NOT NULL | Display label, e.g., "Spring 2026", "J-Term 2026" |
| `start_date` | DATE | NOT NULL | Inclusive start of the term |
| `end_date` | DATE | NOT NULL | Inclusive end of the term |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | Lower values sort first. Ties broken by `start_date DESC` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Row creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Last modification (application-level update) |

**Index:**

```sql
CREATE INDEX IF NOT EXISTS idx_academic_terms_sort ON academic_terms(sort_order, start_date DESC);
```

This index supports the default query ordering: `ORDER BY sort_order ASC, start_date DESC`.

**Design Rationale:**
- `sort_order` allows admins to control button display order independently of chronological order (e.g., putting the current term first regardless of date).
- The CHECK constraint prevents creating terms where end_date is on or before start_date.
- `updated_at` is set application-side on UPDATE (matching the pattern used in `tenant_settings`, `notification_preferences`, and `recurring_rides`). No database trigger.
- VARCHAR(50) for `name` prevents excessively long term names that would break the quick-select button layout.

### 2.2 Migration Placement

Add to the `statements` array inside `runMigrations()` in `server.js` (after line 361, before the `// ----- Constraints -----` comment at line 363):

```javascript
// In runMigrations(), append to statements array:
`CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_terms_date_order CHECK (end_date > start_date)
);`,
`CREATE INDEX IF NOT EXISTS idx_academic_terms_sort
  ON academic_terms(sort_order, start_date DESC);`,
```

**Insertion point:** After `idx_notifications_created_at` index (line 361), before the `// ----- Constraints -----` block (line 363).

### 2.3 Default Seed Function

Add a new `seedDefaultTerms()` function, called from `initDb()` after `seedDefaultSettings()`. This function reads the current `academic_period_label` value and generates 3 terms for the current calendar year.

```javascript
async function seedDefaultTerms() {
  const existing = await query('SELECT COUNT(*) FROM academic_terms');
  if (parseInt(existing.rows[0].count) > 0) return;

  // Read the academic_period_label to determine term structure
  const labelResult = await query(
    "SELECT setting_value FROM tenant_settings WHERE setting_key = 'academic_period_label'"
  );
  const periodLabel = labelResult.rows[0]?.setting_value || 'Semester';
  const year = new Date().getFullYear();

  let terms;
  if (periodLabel === 'Quarter') {
    terms = [
      { name: `Winter ${year}`, start: `${year}-01-06`, end: `${year}-03-21`, sort: 0 },
      { name: `Spring ${year}`, start: `${year}-03-24`, end: `${year}-06-13`, sort: 1 },
      { name: `Summer ${year}`, start: `${year}-06-16`, end: `${year}-09-12`, sort: 2 },
      { name: `Fall ${year}`, start: `${year}-09-22`, end: `${year}-12-12`, sort: 3 }
    ];
  } else if (periodLabel === 'Trimester') {
    terms = [
      { name: `Spring ${year}`, start: `${year}-01-13`, end: `${year}-04-30`, sort: 0 },
      { name: `Summer ${year}`, start: `${year}-05-05`, end: `${year}-08-15`, sort: 1 },
      { name: `Fall ${year}`, start: `${year}-08-25`, end: `${year}-12-12`, sort: 2 }
    ];
  } else {
    // Default: Semester
    terms = [
      { name: `Spring ${year}`, start: `${year}-01-13`, end: `${year}-05-09`, sort: 0 },
      { name: `Summer ${year}`, start: `${year}-05-19`, end: `${year}-08-08`, sort: 1 },
      { name: `Fall ${year}`, start: `${year}-08-18`, end: `${year}-12-12`, sort: 2 }
    ];
  }

  for (const t of terms) {
    await query(
      `INSERT INTO academic_terms (id, name, start_date, end_date, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [generateId('term'), t.name, t.start, t.end, t.sort]
    );
  }
}
```

**Placement in `initDb()`:** Call `seedDefaultTerms()` after `seedDefaultContent()` (after line 265 in server.js):

```javascript
async function initDb() {
  // ... existing schema + migrations ...
  await seedDefaultSettings();
  await seedDefaultContent();
  await seedDefaultTerms();  // <-- NEW
}
```

---

## 3. API Endpoints

All endpoints follow existing patterns: `wrapAsync()` wrapper, JSON responses, parameterized SQL.

### 3.1 GET /api/academic-terms

**Auth:** `requireStaff` (office + drivers can read; analytics is office-only but this endpoint is harmless to expose to staff)

**Response:** `200 OK`
```json
[
  {
    "id": "term_a1b2c3d4",
    "name": "Spring 2026",
    "start_date": "2026-01-13",
    "end_date": "2026-05-09",
    "sort_order": 0
  },
  {
    "id": "term_e5f6g7h8",
    "name": "Summer 2026",
    "start_date": "2026-05-19",
    "end_date": "2026-08-08",
    "sort_order": 1
  }
]
```

**SQL:**
```sql
SELECT id, name, start_date, end_date, sort_order
FROM academic_terms
ORDER BY sort_order ASC, start_date DESC
```

**Notes:**
- No pagination (expected <20 rows).
- Dates returned as `YYYY-MM-DD` strings (PostgreSQL DATE type serializes this way by default).

### 3.2 POST /api/academic-terms

**Auth:** `requireOffice`

**Request Body:**
```json
{
  "name": "Fall 2026",
  "start_date": "2026-08-18",
  "end_date": "2026-12-12",
  "sort_order": 3
}
```

**Validation:**
| Field | Rule | Error Message |
|-------|------|---------------|
| `name` | Required, string, 1-50 chars, trimmed | "Term name is required (max 50 characters)" |
| `start_date` | Required, valid `YYYY-MM-DD` date | "Valid start date is required" |
| `end_date` | Required, valid `YYYY-MM-DD` date | "Valid end date is required" |
| `end_date > start_date` | end must be after start | "End date must be after start date" |
| `sort_order` | Optional integer >= 0, default 0 | (none -- defaults silently) |

**Response:** `201 Created`
```json
{
  "id": "term_x9y0z1a2",
  "name": "Fall 2026",
  "start_date": "2026-08-18",
  "end_date": "2026-12-12",
  "sort_order": 3
}
```

### 3.3 PUT /api/academic-terms/:id

**Auth:** `requireOffice`

**Request Body:** Same shape as POST. All fields required.

**Additional Validation:**
- Term with given `id` must exist (404 if not).

**Response:** `200 OK`
```json
{
  "id": "term_x9y0z1a2",
  "name": "Fall 2026 (Revised)",
  "start_date": "2026-08-25",
  "end_date": "2026-12-19",
  "sort_order": 3
}
```

### 3.4 DELETE /api/academic-terms/:id

**Auth:** `requireOffice`

**Validation:**
- Term with given `id` must exist (404 if not).

**Response:** `200 OK`
```json
{ "success": true }
```

### 3.5 Route Placement in server.js

Insert the 4 routes between the analytics export-report endpoint (ends at line 4823) and the notification-preferences section (starts at line 4826). The exact insertion point is after line 4823 and before the `// ----- Notification Preferences -----` comment:

```
Line 4823: }));
Line 4824:
Line 4825: // ----- Dev endpoint -----
Line 4826: // ----- Notification Preferences -----
```

Insert after line 4824:

```javascript
// ----- Academic Terms -----
app.get('/api/academic-terms', requireStaff, wrapAsync(async (req, res) => {
  // ...
}));

app.post('/api/academic-terms', requireOffice, wrapAsync(async (req, res) => {
  // ...
}));

app.put('/api/academic-terms/:id', requireOffice, wrapAsync(async (req, res) => {
  // ...
}));

app.delete('/api/academic-terms/:id', requireOffice, wrapAsync(async (req, res) => {
  // ...
}));
```

---

## 4. Frontend Changes

### 4.1 Settings Panel (index.html)

Add a new sub-tab "Academic Terms" to the Settings panel tab bar. Insert after the existing "Data Management" tab (line 412):

```html
<!-- Line 412 in index.html, after admin-data-view tab button -->
<button class="ro-tab" data-subtarget="admin-terms-view">Academic Terms</button>
```

Add the corresponding sub-panel container. Insert after the `admin-data-view` sub-panel closing tag:

```html
<div class="sub-panel" id="admin-terms-view">
  <div id="academic-terms-container" class="p-24"></div>
</div>
```

### 4.2 Settings Panel (app.js) -- New Functions

Add three new functions near the existing `loadBusinessRules()` / `saveBusinessRules()` functions (around line 5320):

#### `loadAcademicTerms()`
- Fetches `GET /api/academic-terms`
- Renders a header row ("Academic Terms" title + "Add Term" button)
- Renders a table with columns: Name, Start Date, End Date, Sort Order, Actions
- Each row has Edit (pencil icon) and Delete (trash icon) action buttons
- Empty state: "No academic terms defined. Add terms to enable quick date range selection in Analytics."

#### `saveAcademicTerm(termData, termId)`
- If `termId` is provided, calls `PUT /api/academic-terms/:id`
- Otherwise calls `POST /api/academic-terms`
- On success: `showToastNew('Term saved', 'success')`, then re-calls `loadAcademicTerms()`

#### `deleteAcademicTerm(termId, termName)`
- Shows `showModalNew()` confirmation: "Delete term '{name}'? This cannot be undone."
- On confirm: calls `DELETE /api/academic-terms/:id`
- On success: `showToastNew('Term deleted', 'success')`, then re-calls `loadAcademicTerms()`

**Lazy-load trigger:** Add to the existing sub-tab click handler for the settings panel. When `admin-terms-view` becomes active, call `loadAcademicTerms()` (load once, re-load on each activation for freshness since the dataset is small).

### 4.3 Hide `academic_period_label` from Business Rules

In `loadBusinessRules()` (app.js:5185), add a skip condition before the setting type checks:

```javascript
// At line 5185, inside the for-loop over settings:
for (const s of settings) {
  // Hide deprecated setting -- replaced by Academic Terms
  if (s.key === 'academic_period_label') continue;
  // ... rest of rendering ...
}
```

This causes the setting to still be saved/loaded server-side but never shown in the UI. The existing `else if (s.key === 'academic_period_label')` block (lines 5215-5224) becomes dead code and should be removed.

### 4.4 Analytics Date Picker (index.html)

Replace the static semester button (line 291) with a dynamic container:

**Before:**
```html
<div class="analytics-quick-select">
  <button class="ro-btn ro-btn--ghost ro-btn--xs" data-range="today">Today</button>
  <button class="ro-btn ro-btn--ghost ro-btn--xs active" data-range="7d">Week</button>
  <button class="ro-btn ro-btn--ghost ro-btn--xs" data-range="this-month">Month</button>
  <button class="ro-btn ro-btn--ghost ro-btn--xs" data-range="semester" id="analytics-semester-btn">Semester</button>
</div>
```

**After:**
```html
<div class="analytics-quick-select">
  <button class="ro-btn ro-btn--ghost ro-btn--xs" data-range="today">Today</button>
  <button class="ro-btn ro-btn--ghost ro-btn--xs active" data-range="7d">Week</button>
  <button class="ro-btn ro-btn--ghost ro-btn--xs" data-range="this-month">Month</button>
  <span id="analytics-term-buttons"></span>
</div>
```

### 4.5 Analytics Date Picker (app.js) -- Dynamic Term Buttons

Add a new function `loadAnalyticsTermButtons()` and a module-level variable `_academicTerms`:

```javascript
var _academicTerms = [];

async function loadAnalyticsTermButtons() {
  try {
    const res = await fetch('/api/academic-terms');
    if (!res.ok) return;
    _academicTerms = await res.json();
  } catch (e) {
    _academicTerms = [];
  }
  renderTermButtons();
}
```

#### `renderTermButtons()`

Logic:
1. Get `#analytics-term-buttons` container.
2. If `_academicTerms.length === 0`, render nothing (container stays empty).
3. If `_academicTerms.length <= 4`, render one button per term.
4. If `_academicTerms.length > 4`, render 3 most recent (by `start_date` descending) as buttons, plus a "More" dropdown button containing the remaining terms.

Each term button:
```html
<button class="ro-btn ro-btn--ghost ro-btn--xs" data-term-id="term_abc123"
        data-term-from="2026-01-13" data-term-to="2026-05-09">Spring 2026</button>
```

The "More" dropdown:
```html
<div class="analytics-term-more" style="position:relative;display:inline-block;">
  <button class="ro-btn ro-btn--ghost ro-btn--xs" id="analytics-term-more-btn">
    More <i class="ti ti-chevron-down" style="font-size:12px;"></i>
  </button>
  <div class="analytics-term-dropdown" id="analytics-term-dropdown">
    <button class="analytics-term-dropdown-item" data-term-id="..." data-term-from="..." data-term-to="...">Term Name</button>
    <!-- ... -->
  </div>
</div>
```

#### Click Handler

Attach click handlers to term buttons (both inline and dropdown):

```javascript
function handleTermButtonClick(btn) {
  // Clear active state from all quick-select buttons
  document.querySelectorAll('.analytics-quick-select button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.analytics-term-dropdown-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  var fromInput = document.getElementById('analytics-from');
  var toInput = document.getElementById('analytics-to');
  if (fromInput) fromInput.value = btn.dataset.termFrom;
  if (toInput) toInput.value = btn.dataset.termTo;

  // Close dropdown if open
  var dropdown = document.getElementById('analytics-term-dropdown');
  if (dropdown) dropdown.classList.remove('open');

  // Invalidate caches and reload
  _tardinessCache.data = null;
  _hotspotsCache.data = null;
  reloadActiveAnalyticsTab();
}
```

#### Active State Detection

When from/to inputs change (or on initial load), check if current range matches any term:

```javascript
function highlightActiveTermButton() {
  var from = document.getElementById('analytics-from')?.value;
  var to = document.getElementById('analytics-to')?.value;
  document.querySelectorAll('[data-term-id]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.termFrom === from && btn.dataset.termTo === to);
  });
}
```

### 4.6 Remove `setAnalyticsQuickRange('semester')` Case

In `setAnalyticsQuickRange()` (app.js:3131-3174), remove the entire `case 'semester':` block (lines 3151-3173). Term date ranges are now set directly from the button's data attributes, not computed.

### 4.7 Remove `academic_period_label` Button Label Update

In `applyTenantTheme()` (app.js:243-247), remove the semester button label update code:

```javascript
// REMOVE these lines (243-247):
// const semesterBtn = document.getElementById('analytics-semester-btn');
// if (semesterBtn && tenantConfig.academic_period_label) {
//   semesterBtn.textContent = tenantConfig.academic_period_label;
// }
```

### 4.8 Call `loadAnalyticsTermButtons()` on Init

In the DOMContentLoaded handler or the analytics initialization code, call `loadAnalyticsTermButtons()`. This should happen after `applyTenantTheme()` and after the existing quick-select button event listeners are bound (around app.js:6295).

```javascript
// After line 6295 in app.js (after quick-select event binding):
loadAnalyticsTermButtons();
```

Also call `loadAnalyticsTermButtons()` whenever terms are modified from the Settings panel (inside the success callbacks of `saveAcademicTerm()` and `deleteAcademicTerm()`).

---

## 5. CSS Changes

### 5.1 Term Dropdown Styles

Add to `public/css/rideops-theme.css` after the existing `.analytics-quick-select` rules (after line 1580):

```css
/* ── Analytics Term Dropdown ── */
.analytics-term-more {
  position: relative;
  display: inline-block;
}
.analytics-term-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  min-width: 160px;
  padding: 4px 0;
  margin-top: 4px;
}
.analytics-term-dropdown.open {
  display: block;
}
.analytics-term-dropdown-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
}
.analytics-term-dropdown-item:hover {
  background: var(--color-surface-dim);
}
.analytics-term-dropdown-item.active {
  background: var(--color-primary);
  color: #fff;
}
```

### 5.2 Academic Terms Settings Table

The terms table in Settings reuses existing `.ro-table` and `.ro-table-wrap` classes. No new CSS needed for the table itself.

For the inline edit form row, use existing `.ro-input` and `.ro-btn` classes.

---

## 6. State Management

### Client-Side

| Data | Storage | Lifecycle |
|------|---------|-----------|
| `_academicTerms` | Module-level `var` in app.js | Loaded once on page init, refreshed when terms are modified in Settings |
| Active term highlight | DOM class (`.active`) | Recalculated on from/to input change |
| Term dropdown open state | DOM class (`.open`) | Toggled on click, closed on outside click or term selection |

### Caching

- Terms are fetched once on page load via `loadAnalyticsTermButtons()` and cached in `_academicTerms`.
- When terms are created/updated/deleted in Settings, `_academicTerms` is refreshed and `renderTermButtons()` is called again.
- No server-side caching needed (simple SELECT on a small table).

---

## 7. Server-Side Implementation Detail

### 7.1 Full Endpoint Implementations

```javascript
// ----- Academic Terms -----

app.get('/api/academic-terms', requireStaff, wrapAsync(async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, start_date, end_date, sort_order FROM academic_terms ORDER BY sort_order ASC, start_date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('academic-terms list error:', err);
    res.status(500).json({ error: 'Failed to fetch academic terms' });
  }
}));

app.post('/api/academic-terms', requireOffice, wrapAsync(async (req, res) => {
  try {
    const { name, start_date, end_date, sort_order } = req.body;

    // Validation
    const trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length > 50) {
      return res.status(400).json({ error: 'Term name is required (max 50 characters)' });
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!start_date || !dateRe.test(start_date)) {
      return res.status(400).json({ error: 'Valid start date is required (YYYY-MM-DD)' });
    }
    if (!end_date || !dateRe.test(end_date)) {
      return res.status(400).json({ error: 'Valid end date is required (YYYY-MM-DD)' });
    }
    if (end_date <= start_date) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    const id = generateId('term');
    const sortVal = Number.isInteger(sort_order) && sort_order >= 0 ? sort_order : 0;

    const result = await query(
      `INSERT INTO academic_terms (id, name, start_date, end_date, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, start_date, end_date, sort_order`,
      [id, trimmedName, start_date, end_date, sortVal]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('academic-terms create error:', err);
    res.status(500).json({ error: 'Failed to create academic term' });
  }
}));

app.put('/api/academic-terms/:id', requireOffice, wrapAsync(async (req, res) => {
  try {
    const { name, start_date, end_date, sort_order } = req.body;

    // Check existence
    const existing = await query('SELECT id FROM academic_terms WHERE id = $1', [req.params.id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    // Validation (same as POST)
    const trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length > 50) {
      return res.status(400).json({ error: 'Term name is required (max 50 characters)' });
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!start_date || !dateRe.test(start_date)) {
      return res.status(400).json({ error: 'Valid start date is required (YYYY-MM-DD)' });
    }
    if (!end_date || !dateRe.test(end_date)) {
      return res.status(400).json({ error: 'Valid end date is required (YYYY-MM-DD)' });
    }
    if (end_date <= start_date) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    const sortVal = Number.isInteger(sort_order) && sort_order >= 0 ? sort_order : 0;

    const result = await query(
      `UPDATE academic_terms
       SET name = $1, start_date = $2, end_date = $3, sort_order = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, start_date, end_date, sort_order`,
      [trimmedName, start_date, end_date, sortVal, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('academic-terms update error:', err);
    res.status(500).json({ error: 'Failed to update academic term' });
  }
}));

app.delete('/api/academic-terms/:id', requireOffice, wrapAsync(async (req, res) => {
  try {
    const result = await query('DELETE FROM academic_terms WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Academic term not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('academic-terms delete error:', err);
    res.status(500).json({ error: 'Failed to delete academic term' });
  }
}));
```

### 7.2 Validation Helper (Optional Refactor)

The date and name validation is duplicated between POST and PUT. If desired, extract to a helper:

```javascript
function validateTermInput(body) {
  const errors = [];
  const trimmedName = (body.name || '').trim();
  if (!trimmedName || trimmedName.length > 50) errors.push('Term name is required (max 50 characters)');
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!body.start_date || !dateRe.test(body.start_date)) errors.push('Valid start date is required (YYYY-MM-DD)');
  if (!body.end_date || !dateRe.test(body.end_date)) errors.push('Valid end date is required (YYYY-MM-DD)');
  if (body.start_date && body.end_date && body.end_date <= body.start_date) errors.push('End date must be after start date');
  return { trimmedName, errors };
}
```

This is a code quality improvement, not architecturally required.

---

## 8. Deprecation Plan for `academic_period_label`

### What Changes

| Location | Current Behavior | New Behavior |
|----------|-----------------|-------------|
| `tenant_settings` row | Stores "Semester", "Quarter", or "Trimester" | Row remains in DB, untouched |
| `GET /api/settings` | Returns `academic_period_label` in `operations` category | Still returns it (server unchanged) |
| `PUT /api/settings` | Accepts updates to `academic_period_label` | Still accepts (server unchanged) |
| `loadBusinessRules()` (app.js:5215) | Renders a `<select>` dropdown | Skipped via `continue` (hidden from UI) |
| `GET /api/tenant-config` (server.js:891) | Includes `academic_period_label` in response | Still included (backward compat) |
| `applyTenantTheme()` (app.js:243) | Updates `#analytics-semester-btn` text | Code removed (element no longer exists) |
| `setAnalyticsQuickRange('semester')` | Computes dates based on label | `case 'semester'` removed entirely |

### What Does NOT Change

- The `seedDefaultSettings()` function still seeds `academic_period_label` (it runs `ON CONFLICT DO NOTHING`, so it is harmless).
- The `semester-report` endpoint (server.js:2884) still uses hardcoded semester date logic. This is a **separate follow-up task** (see Deferred Decisions).

---

## 9. File Change Summary

### server.js

| Location | Change |
|----------|--------|
| `runMigrations()` (line ~362) | Add `CREATE TABLE IF NOT EXISTS academic_terms` + index |
| After `seedDefaultContent()` in `initDb()` (line ~265) | Add `await seedDefaultTerms();` call |
| New function (after `seedDefaultContent`, ~line 466) | Add `seedDefaultTerms()` function |
| After line 4824 | Add 4 academic-terms API routes (~80 lines) |

### public/app.js

| Location | Change |
|----------|--------|
| Lines 243-247 | Remove `analytics-semester-btn` label update |
| Line 3151-3173 | Remove `case 'semester'` from `setAnalyticsQuickRange()` |
| Line 5185 | Add `if (s.key === 'academic_period_label') continue;` |
| Lines 5215-5224 | Remove dead `academic_period_label` select rendering code |
| New (~line 5320) | Add `loadAcademicTerms()`, `saveAcademicTerm()`, `deleteAcademicTerm()` |
| New (~line 3175) | Add `_academicTerms`, `loadAnalyticsTermButtons()`, `renderTermButtons()`, `handleTermButtonClick()`, `highlightActiveTermButton()` |
| Line ~6295 | Add `loadAnalyticsTermButtons()` call |
| Settings sub-tab handler | Add lazy-load trigger for `admin-terms-view` |

### public/index.html

| Location | Change |
|----------|--------|
| Line 412 | Add "Academic Terms" tab button |
| After `admin-data-view` sub-panel | Add `admin-terms-view` sub-panel with container div |
| Lines 291 | Replace static semester button with `<span id="analytics-term-buttons"></span>` |

### public/css/rideops-theme.css

| Location | Change |
|----------|--------|
| After line 1580 | Add `.analytics-term-more`, `.analytics-term-dropdown`, `.analytics-term-dropdown-item` styles (~30 lines) |

---

## 10. Deferred Decisions

### D-1: Semester Report Endpoint

**Current state:** `GET /api/analytics/semester-report` (server.js:2884-2962) uses hardcoded date logic to determine "current semester" and "previous semester" boundaries.

**Future migration:** Update this endpoint to query `academic_terms` for the most recent term whose `start_date <= NOW()` and use that as the "current" term, with the previous term as the comparison period.

**Migration complexity:** Low. Replace ~20 lines of date calculation with a 2-row query. No schema changes needed.

**Recommended timeline:** Next sprint after the core academic terms feature ships.

### D-2: Per-Campus Terms

**Current state:** Terms are global (shared across all campuses).

**Future migration:** If campuses need different academic calendars, add an optional `campus_slug TEXT` column to `academic_terms`. NULL means global (visible to all). A non-null value scopes the term to that campus. The `GET /api/academic-terms` endpoint would filter by the session's campus.

**Migration complexity:** Medium. Requires:
- `ALTER TABLE academic_terms ADD COLUMN campus_slug TEXT;`
- Update API to filter by campus
- Update Settings UI to show campus scope
- Update seed logic per campus

**Recommended timeline:** Only if a real multi-campus deployment requests it.

### D-3: Remove `academic_period_label` Setting Entirely

**Current state:** The setting row remains in `tenant_settings` but is hidden from the UI.

**Future migration:** After confirming no external integrations depend on `academic_period_label` in the tenant-config response, remove it from `seedDefaultSettings()` and optionally `DELETE FROM tenant_settings WHERE setting_key = 'academic_period_label'` in a migration.

**Migration complexity:** Trivial.

**Recommended timeline:** 2-3 months after the feature ships, once backward compatibility is confirmed.

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin creates 50+ terms, breaking button layout | Low | Low | "More" dropdown caps visible buttons at 3-4. Dropdown scrolls if needed. |
| Date validation bypass | Low | Medium | Server-side CHECK constraint + application validation. DB rejects bad dates even if JS validation is bypassed. |
| Stale term buttons after Settings edit | Medium | Low | `loadAnalyticsTermButtons()` is called after every save/delete in Settings. |
| `semester-report` endpoint confusion | Medium | Low | Endpoint still works with its hardcoded logic. Not broken, just not aligned with user-defined terms yet. Documented in Deferred Decisions. |
| Demo seed overwrite | Low | Low | `seedDefaultTerms()` has `COUNT(*) > 0` guard. Existing terms are never overwritten. |

---

## 12. Testing Considerations

### API Tests (add to tests/e2e.spec.js)

1. **CRUD lifecycle:** Create term, list (verify it appears), update, delete, list (verify it's gone).
2. **Validation:** Empty name (400), missing dates (400), end before start (400), name too long (400).
3. **Auth:** Verify `requireStaff` on GET, `requireOffice` on POST/PUT/DELETE. Rider gets 403.
4. **404:** Update/delete nonexistent term ID.
5. **Default seed:** On fresh DB, verify 3 terms are seeded.

### UI Tests (manual or future e2e)

1. Settings panel shows Academic Terms tab.
2. Can add a term, it appears in the table.
3. Can edit a term inline.
4. Delete shows confirmation modal, then removes the term.
5. Analytics date picker shows term buttons.
6. Clicking a term button sets the correct date range.
7. "More" dropdown appears when >4 terms exist.
8. No broken buttons when 0 terms exist.

---

## 13. Implementation Order

Recommended implementation sequence:

1. **Database migration + seed function** (server.js) -- foundation, can be tested via psql
2. **API endpoints** (server.js) -- can be tested via curl/Playwright API
3. **Analytics date picker rewrite** (index.html + app.js) -- visual, most user-facing impact
4. **Settings UI** (index.html + app.js) -- CRUD interface
5. **CSS** (rideops-theme.css) -- dropdown styles
6. **Deprecation cleanup** (app.js) -- remove old code paths
7. **Tests** (e2e.spec.js) -- verify everything works
8. **CLAUDE.md update** -- document the new endpoints and schema
