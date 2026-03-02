# Requirements: User-Defined Academic Terms

**Status:** Draft
**Date:** 2026-03-02
**Author:** Architecture Agent

---

## 1. Problem Statement

The analytics date range picker currently offers a single "Semester" quick-select button whose label and date ranges are derived from the `academic_period_label` tenant setting. This setting provides three hardcoded options (Semester, Quarter, Trimester) with fixed date ranges calculated in `setAnalyticsQuickRange()` (app.js:3131-3174).

**Problems with the current approach:**
- Date ranges are approximations (e.g., "Spring Semester" always starts Jan 10) that do not match any real university's calendar.
- There is no way to define custom term names (e.g., "J-Term", "Maymester", "Summer Session II").
- Switching between Semester/Quarter/Trimester changes the single button label and date calculation logic, but the computed dates are still guesses.
- No campus-agnostic way to handle universities with non-standard term structures.

## 2. Proposed Solution

Replace the hardcoded `academic_period_label` dropdown with a user-defined academic terms system. Admins create named terms with explicit start and end dates. These terms appear as quick-select buttons in the analytics date range picker.

## 3. Functional Requirements

### FR-1: Academic Terms CRUD
- **FR-1.1:** Office users can create academic terms with a name, start date, and end date.
- **FR-1.2:** Office users can edit existing academic terms.
- **FR-1.3:** Office users can delete academic terms (with confirmation).
- **FR-1.4:** Office and staff users can list all academic terms.
- **FR-1.5:** Terms are ordered by `sort_order` (ascending), then by `start_date` (descending, most recent first).

### FR-2: Analytics Date Picker Integration
- **FR-2.1:** The static "Semester" button is replaced with dynamically rendered term buttons.
- **FR-2.2:** Clicking a term button sets the analytics date range to that term's start/end dates.
- **FR-2.3:** If more than 4 terms exist, show the 3 most recent (by start_date) as buttons plus a "More" dropdown containing the rest.
- **FR-2.4:** The active term button is highlighted (`.active` class) when the current from/to range matches a term's dates exactly.
- **FR-2.5:** If no terms are defined, the picker shows only Today, Week, and Month buttons (no broken or empty term section).

### FR-3: Settings UI
- **FR-3.1:** A new "Academic Terms" section appears in the Settings panel as a new sub-tab.
- **FR-3.2:** The section displays a table of terms with columns: Name, Start Date, End Date, and actions (Edit, Delete).
- **FR-3.3:** An "Add Term" button opens an inline form row or a small form above the table.
- **FR-3.4:** Edit uses inline editing in the table row.
- **FR-3.5:** Delete shows a confirmation modal via `showModalNew()`.
- **FR-3.6:** The `academic_period_label` dropdown is removed from the Business Rules settings form.

### FR-4: Default Seeding
- **FR-4.1:** On first run (empty `academic_terms` table), seed default terms based on the current `academic_period_label` setting value and the current year.
- **FR-4.2:** Default seed produces 3 terms for the current academic year (e.g., Spring 2026, Summer 2026, Fall 2026).

### FR-5: Backward Compatibility
- **FR-5.1:** The `academic_period_label` row stays in `tenant_settings` (not deleted) but is no longer displayed in the Settings UI.
- **FR-5.2:** The `/api/tenant-config` response may still include `academic_period_label` for any external consumers, but the analytics picker reads from `/api/academic-terms` instead.

## 4. Non-Functional Requirements

- **NFR-1:** No new npm dependencies required.
- **NFR-2:** No new CDN dependencies required.
- **NFR-3:** Terms are scoped globally (not per-campus). Multi-campus deployments share the same terms.
- **NFR-4:** The feature works in both demo mode and production.
- **NFR-5:** Validation: name required (max 50 chars), start_date required, end_date required, end_date must be after start_date. Overlapping terms are allowed (e.g., "Summer I" and "Summer II" may overlap).

## 5. Out of Scope

- **Recurring/templated terms** (auto-generate next year's terms) -- potential future enhancement.
- **Updating the `semester-report` endpoint** (server.js:2884) to use `academic_terms` instead of hardcoded date logic. This is a separate follow-up task.
- **Per-campus terms** -- all campuses share the same term definitions for now.
- **Drag-and-drop reordering** of terms in the settings UI. Sort order is set via the `sort_order` field.

## 6. Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `server.js` | Migration + API | New table, 4 new endpoints, seed logic |
| `public/app.js` | UI Logic | Settings section, analytics picker rewrite |
| `public/index.html` | HTML | New settings sub-tab, remove static semester button |
| `public/css/rideops-theme.css` | CSS | Term button overflow/dropdown styles |
| `CLAUDE.md` | Docs | Update API endpoint listing, settings table, date picker description |
