# Agent working guide

This guide is for contributors and coding agents working on Ten Reservations. Read [README.md](README.md) for installation, API contracts, and operational details. See [Screenshots.md](Screenshots.md) for the interface.

## Architecture

- **Angular** in `frontend/src/app/` owns routes, components, form state, accessibility, and calls to same-origin JSON endpoints.
- **Django** in `bookings/` owns staff authentication, validation, filtering, pagination, and booking rules. Keep state transitions in `bookings/services.py`.
- **SQLite** is the configured database. Models and migrations live in `bookings/models.py` and `bookings/migrations/`.
- The shared visual styles are in `bookings/static/bookings/app.css`; Angular-specific adaptations are in `frontend/src/styles.css`. Illustrative local photos and their credits live under `bookings/static/bookings/images/`.
- Python packages are pinned in `requirements.txt`; frontend dependencies are pinned in `frontend/package.json` and `frontend/package-lock.json`.

## Business rules to preserve

1. Each successful booking reserves one inventory place and increments one member's count atomically. Members may book only while their count is below two.
2. Imported counts above two are deliberate source values. Show them as over-limit and block further bookings; do not silently normalize them or invent historical booking references.
3. An experience is bookable through its expiration date in UTC. Earlier dates and zero stock must be rejected by Django, even if a browser submits stale data.
4. Cancellation requires the matching member and UUID. Restore counters exactly once, retain the cancelled record, and allow cancellation after expiry.
5. Preserve duplicate names and experience titles; record IDs distinguish them.
6. CSV imports validate both files before insertion. Identical repeat imports must not reset live counts; changed imports into a populated database must be refused.

## Interface behavior to preserve

- Inventory quick filters: All experiences, Available, Low stock, Expired, and Sold out. Low stock means one or two places and no expiry.
- Inventory fetches two complete rows by default, with an optional third row. Read the rendered CSS column count: desktop capacities are 6/9, medium layouts 4/6, and phones 2/3. Reset to page one when the column count changes.
- Booking history defaults to five rows. Its Per page menu offers 5 for up to five matches, 5/10 for six to ten matches, and 5/10/15 for eleven or more. Do not add exact-total `All N` choices to history; the booking API rejects sizes above 15.
- Filter and paginate ordered SQL querysets before serialization. Do not replace server pagination with slicing the entire dataset in the browser.
- Keep search/filter/page state in URLs. Prevent stale asynchronous responses from replacing newer results.
- Reuse `ChoiceSelect` for searchable member/item selections and `SelectControl` for compact Status/Per page menus. Preserve visible labels, keyboard navigation, focus indicators, and disabled expired/sold-out choices.
- Booking/cancellation notifications appear at the top center, expire after five seconds, and allow early dismissal. Successful copies show `Copied!` for two seconds after clipboard confirmation.
- A successful booking clears both booking selections. A failed booking retains them for correction.

## Authentication and data handling

- Staff-only access is enforced server-side. Browser route guards are supplementary.
- Use Django sessions and CSRF protection; keep requests on the same origin. Never put session credentials in localStorage or disable CSRF to fix an integration issue.
- Render untrusted values as text. Avoid raw HTML injection or sanitization bypasses.
- `manage.py` defaults to `config.development` with loopback hosts and debug off. WSGI/ASGI default to `config.production`, which requires explicit environment secrets and allowed hosts.
- Preserve HTTPS redirects, secure cookies, response cache controls, and production security checks. `runserver --insecure` is only for local static-file serving.
- Do not overwrite an existing database, reset imported counts, rotate real account credentials, or alter the supplied CSV files as part of routine development.

## Development and validation

Use the full setup instructions in the README for a fresh checkout. From an existing Windows installation:

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --insecure
```

Build Angular before starting Django the first time so static-file discovery includes the generated bundles. For live Angular development, run Django on 8000 and `npm --prefix frontend start` on 4200 using the existing proxy.

Run checks appropriate to the change:

```powershell
.\.venv\Scripts\python.exe manage.py test --noinput
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
npm --prefix frontend test
npm --prefix frontend run build
```

On macOS/Linux, replace `.\.venv\Scripts\python.exe` with `.venv/bin/python`. Backend tests use the reserved `test_db.sqlite3`; run one backend test process at a time. Browser checks should use an isolated database and temporary staff account with synthetic records. Verify keyboard interaction and responsive layouts when changing UI behavior. Documentation-only changes need link/content checks rather than unrelated new tests.

## Repository and documentation

- Keep setup and API instructions in `README.md`; explain meaningful architecture or workflow changes here. Refresh the screenshot gallery when visible behavior changes.
- `README.personal.md` is a private local reference and must remain ignored. Do not copy its contents into public documentation wholesale.
- Never commit or upload `.local/`, secrets, `.env` files, databases, the Word challenge document, authentication state, or QA artifacts. Keep generated dependencies/build outputs ignored.
- Public screenshots must come from synthetic demo records and show no real member information, credentials, account details, browser chrome, or local filesystem paths.
- Review the exact staged files and `git diff --check` before committing. Fetch and inspect upstream changes before pushing; do not force-push over someone else's work.
- A local build is not evidence of a ready hosted deployment. Verify the intended account/project, exact commit, preview environment, backend requests, and storage behavior before claiming a live URL works. A writable SQLite file is not persistent storage on Vercel; provision appropriate hosted storage for a full deployment.
