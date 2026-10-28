# Ten Reservations

A staff reservations desk using **Angular 22.2.3**, **Django 5.2.18**, and **SQLite**. Angular renders the interface and calls protected JSON APIs. Django owns authentication, validation, business rules, and SQL transactions.

The existing plum/lavender styling, system fonts, photographs, searchable selectors, and five-second notifications are preserved. No external fonts or images are fetched at runtime. JavaScript is required for Angular.

[Application screenshots](Screenshots.md) show the interface using synthetic demo data. [Agent working guide](Agent.md) explains the architecture, project conventions, and validation workflow for contributors.

## Requirements

- Python 3.12–3.14 with pip/venv; verified with Python 3.14.8.
- Node **22.22.3+ within Node 22**, **24.15+ within Node 24**, or Node 26+. Verified with Node 24.21.0 and npm 11.19.0. Use a supported Node LTS release.
- Internet access for initial dependency installation.
- A terminal in the project root, beside `manage.py`, `frontend/`, and the CSV files.

SQLite comes with Python. Angular CLI is installed locally; a global CLI, database server, Docker, and Django REST Framework are unnecessary. Python dependencies are pinned in `requirements.txt`; npm dependencies are pinned and locked in `frontend/package-lock.json`.

## Windows setup (PowerShell)

Run from the project root:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py load_data
npm --prefix frontend ci
npm --prefix frontend run build
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --insecure
```

Choose your own staff username and strong password; email is optional. There are no default credentials or exposed admin site. Direct Python paths avoid activation-policy issues. If `py` is unavailable, use `python -m venv .venv`.

Open [the reservations desk](http://127.0.0.1:8000/) and sign in. The first import loads **45 members and 15 inventory items**. Keep the server terminal running; stop it with **Ctrl+C**.

`--insecure` enables local static-file serving with debug off. It does not disable authentication or CSRF. Use it only for loopback development. Build Angular **before starting Django** the first time so Django discovers the generated static directory.

## macOS / Linux setup

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py load_data
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python manage.py runserver 127.0.0.1:8000 --insecure
```

Open the same URL. Install your distribution's Python venv package if the first command reports it missing.

## Existing installations and subsequent starts

The Angular migration changes no domain schema and preserves members, stock, booking references, and accounts. **Your existing staff login continues to work.**

For an existing installation, install requirements, run `migrate`, run the npm install/build commands, and restart Django. Run `createsuperuser` only if you have no staff account. Identical repeat CSV imports are safe and do not reset counters.

After installation/build, ordinary starts need only the Django `runserver ... --insecure` command. After frontend changes, run `npm --prefix frontend run build` and refresh. If the first build happens while Django is already running, restart Django to register the generated assets.

Generated files live in `frontend/dist/ten-reservations/browser/` and are ignored. Django serves the Angular entry point at `/`, `/bookings/`, and `/accounts/login/`, with bundles under `/static/angular/`.

## Optional live Angular development

Use two terminals in the project root:

```powershell
# Terminal 1: Django API and original static assets
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --insecure
```

```powershell
# Terminal 2: Angular with live rebuilds
npm --prefix frontend start
```

Open **http://127.0.0.1:4200/**. `frontend/proxy.conf.json` forwards `/api/**`, `/book`, `/cancel`, and `/static/**` to Django on port 8000 while preserving Host/Origin. Keep one host spelling; do not mix localhost and 127.0.0.1. No permissive CORS configuration is added.

Port 4200 uses live edits; port 8000 uses the last production build. If Django's port changes, update the proxy target. Stop both development servers with Ctrl+C when finished.

## Using the application

1. Sign in with active staff. This is a **trusted shared staff desk**: every staff account can manage every member. There is no member self-service or per-staff assignment.
2. Browse inventory, search by title, and use the **All experiences**, **Available**, **Low stock**, **Expired**, and **Sold out** quick filters. Filters and pagination remain in the URL. Expand **Item details** for descriptions and expiry dates.
3. Choose **Book experience** to preselect an item, then select a member and submit. Choices show names/titles, IDs, and count badges. IDs distinguish duplicates. Use arrows, Home/End, Enter, Escape, Tab, or pointer selection.
4. Success appears at the top center for **five seconds**, with an early close button. Booking history retains the UUID, timestamp, and status; use the copy icon beside the reference or select its text manually. Successful copies show **Copied!** beside the icon for two seconds. A successful booking clears the Member and Inventory item choices for the next reservation; an unsuccessful booking keeps your selections.
5. To cancel, select the matching member and enter the UUID. One stock unit and one member slot are restored. The cancelled record remains; repeating cancellation cannot restore stock twice.
6. **Sign out** invalidates the server session through a CSRF-protected POST.

On a fresh import, Emily Johnson (#2) can book Bali (#1). Chloe Brown (#4) starts at the limit; Route 66 (#6) has no stock. Times are displayed in UTC. Imported counts have no individual historical references and cannot be cancelled here.

Desktop navigation becomes compact on mobile; cards/forms stack and history scrolls horizontally. Loading, empty results, business/field errors, and retry controls are included. Uncertain network failures do not automatically retry a booking: check history first. A noscript message explains the JavaScript requirement.

Photographs are illustrative, not extra inventory facts. [Image credits](bookings/static/bookings/images/ATTRIBUTIONS.md) record sources. Unknown titles use a neutral globe illustration.

## API

Data routes and writes require an **active staff session**. `/api/csrf` and anonymous session status are public bootstrap endpoints and expose no member data. JSON endpoint paths have no trailing slash.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/csrf` | CSRF token/cookie |
| GET | `/api/auth/session` | `{authenticated, user}` for the current session |
| POST | `/api/auth/login` | JSON `{username, password}`; rotate session ID and CSRF |
| POST | `/api/auth/logout` | JSON `{}`; end session |
| GET | `/api/inventory?q=Bali&status=available&page=1&page_size=6` | Filtered, paginated items and quick-filter counts |
| GET | `/api/booking-options` | Member/item choices and maximum count |
| GET | `/api/bookings?q=Emily&status=active&page=1&page_size=5` | Filtered, paginated booking history, newest first |
| GET | `/api/bookings/<UUID>` | One booking with current status |
| POST | `/book` | JSON `{member_id, item_id}` |
| POST | `/cancel` | JSON `{member_id, booking_reference}` |

Reads include display labels/count metadata; inventory includes description, expiry, and local cover URL. For compatibility, form POST `/accounts/login/` and CSRF-protected POST `/accounts/logout/` remain available to scripts. Angular uses JSON authentication. HTML POST `/bookings/` is no longer a booking adapter.

Keep one cookie jar. Get CSRF before login, then a **fresh token after login**, and send `X-CSRFToken` on writes. Angular HttpClient reads `csrftoken` and supplies Django's header; its API service bootstraps the cookie before mutations. Session IDs use HttpOnly cookies, never localStorage.

CSRF middleware runs before views, so invalid tokens can return 403 before authentication/body errors. Valid-CSRF anonymous requests receive 401; authenticated non-staff receive 403. Frontend guards improve navigation; Django authorisation is the security boundary.

### Server-side filtering and pagination

Inventory defaults to **two complete rows**, with a **three-row** option. Page capacity follows the rendered grid: desktop shows **6 or 9** cards, two-column layouts **4 or 6**, and single-column layouts **2 or 3**. Resizing across column layouts resets to page one and fetches the appropriate count from Django. If a filtered result fits within a row option, that option reads **All N**; duplicate choices disappear. Inventory URLs retain the row preference with `rows=3` (two rows is the default).

Booking history defaults to **5 records per page**, with a maximum of **15**. Per page shows only useful capacities: **5** for 1-5 matches, **5 and 10** for 6-10 matches, and **5, 10 and 15** for 11 or more matches. There are no exact-total All N choices in booking history. A single useful choice is disabled; empty lists hide the selector. Both **Status** and **Per page** share the existing selectors' styling, selected marks, focus treatment, and keyboard navigation.

Previous/Next and numbered pages remain available. Search/filter/page-size changes reset the page to one. Django filters ordered SQL querysets before applying LIMIT/OFFSET; the browser does not download and slice the entire list. All booking history is reachable, including records beyond the former latest-15 limit.

`/api/inventory` accepts `q`, `status` (`all`, `available`, `low_stock`, `expired`, `sold_out`), `page`, and `page_size`. Available requires positive stock and no expiry. Low stock means one or two places and no expiry. Expired and sold-out filters can overlap. Chip counts respect the current search. Old `available=1` links remain supported unless explicit status is supplied.

`/api/bookings` accepts `q` (member full name, experience title, or full/partial reference), `status` (`all`, `active`, `cancelled`), `page`, and `page_size`. Existing active bookings are not automatically cancelled when an experience expires.

The inventory API accepts integer `page_size` values from **1 to 100**; the bookings API accepts **1 to 15** and rejects larger sizes. The booking UI uses only 5, 10, or 15. API defaults are **6** for inventory and **5** for bookings. For nonempty results, the response page size is capped at the filtered total. Angular computes the inventory request size from columns and rows.

Responses include `pagination`: `page`, `page_size`, `total_count`, `total_pages`, `has_next`, `has_previous`, `start_index`, and `end_index`. Inventory also includes `filter_counts` and each item's `is_expired`/`is_bookable`. Invalid parameters return 400 `invalid_query`; a positive page beyond the end resolves to the last page. Empty results use page 1 with zero start/end indices.

Imported members above the maximum retain their source count, shown in **red with an over-limit label** in both member selectors. Counts exactly at the limit use amber. No historical counts are silently changed; new booking attempts remain blocked and cancellations remain available.

### Authenticated Python example

With the server running, save this standard-library example to a temporary file and run it with the virtual environment's Python. It prompts for staff credentials, books, then cancels. Choose eligible IDs if Emily/Bali is unavailable. Never store passwords in source or shell arguments.

```python
import json
from getpass import getpass
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor, Request, build_opener

base = "http://127.0.0.1:8000"  # HTTPS outside local development.
client = build_opener(HTTPCookieProcessor(CookieJar()))

def csrf():
    with client.open(base + "/api/csrf") as response:
        return json.load(response)["csrf_token"]

def post(path, payload):
    request = Request(base + path, data=json.dumps(payload).encode(), method="POST",
                      headers={"Content-Type": "application/json",
                               "X-CSRFToken": token, "Referer": base + "/"})
    with client.open(request) as response:
        return json.load(response)

token = csrf()
post("/api/auth/login", {"username": input("Staff username: "), "password": getpass("Password: ")})
token = csrf()
booking = post("/book", {"member_id": 2, "item_id": 1})
print(booking)
print(post("/cancel", {"member_id": 2, "booking_reference": booking["booking_reference"]}))
post("/api/auth/logout", {})
```

### Write responses and errors

Booking returns **201** with `booking_reference` (UUID), `member_id`, `item_id`, `booked_at` (UTC ISO datetime), `cancelled_at: null`, and `status: "active"`. Cancellation returns **200** with those fields, populated `cancelled_at`, and `status: "cancelled"`.

Objects must contain exactly the documented fields. IDs must be positive JSON integers, not strings/floats/booleans. Errors use `{"error": {"code": "booking_limit", "message": "This member has reached the limit of 2 bookings."}}`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, fields, ID, UUID |
| 401 | Authentication required / invalid credentials |
| 403 | Permission denied / CSRF failure |
| 404 | Missing member/item/booking or unknown route |
| 405 | Wrong method |
| 409 | Expired experience, member limit, no stock, already cancelled, inconsistent count |
| 413 | JSON body over 64 KiB |
| 415 | Expected application/json |
| 503 | SQLite lock timeout (`Retry-After: 1`); UI also uses 503 for a missing build |

## CSV import and business decisions

`load_data` defaults to CSVs beside manage.py, independent of your working directory. Alternate paths:

```powershell
.\.venv\Scripts\python.exe manage.py load_data --members "C:\path\members.csv" --inventory "C:\path\inventory.csv"
```

Required headers, in order:

```text
members.csv:   name,surname,booking_count,date_joined
inventory.csv: title,description,remaining_count,expiration_date
```

UTF-8/BOM is supported. Text is trimmed; counts must be nonnegative integers. Name fields are limited to 100 characters, titles to 200. Member datetimes use ISO format; naive values mean UTC. Inventory dates use DD/MM/YYYY. Invalid data identifies the file/logical row; the two-file import is atomic.

- Duplicates and supplied counts of three are preserved; IDs distinguish records.
- Counts are outstanding historical baselines. Local bookings increment them; cancellation of a generated local reference decrements them. Historical references were not supplied.
- Eligibility requires a member count below two, positive stock, and an experience that has not expired. An experience is bookable through its expiry date in UTC; earlier dates return HTTP 409 with code `experience_expired`. Expired experiences are marked on cards and disabled in booking choices. Cancellation remains possible after expiry.
- One booking reserves one unit. Repeat bookings of the same item are allowed within limits.
- Short SQLite IMMEDIATE transactions and guarded SQL updates prevent overbooking and duplicate restoration. SQLite serializes writers; consider PostgreSQL at greater concurrency.
- A SHA-256 receipt makes identical imports a no-op. Changed CSVs or populated data without a receipt are refused rather than overwritten. This is seeding, not synchronization.
- Requests are not idempotent; separate successful requests can create separate bookings. Check history after uncertain results.

To reset deliberately, stop all writers and move db.sqlite3 outside the project as a backup, then migrate, create staff, and import again. Old references stay in the backup and cannot be used in the fresh database.

## Verification

From the project root:

```powershell
.\.venv\Scripts\python.exe manage.py test --noinput
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe -m pip check
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend audit
```

On macOS/Linux use `.venv/bin/python`. Backend tests work independently of Node/build output using an Angular-shell fixture. They cover transactions, rollback, import, concurrency, validation, reads, roles, auth/CSRF, and production settings. Frontend tests cover sessions/tokens, navigation, selectors, escaped text, booking/cancellation, errors, and notification timing.

Django tests create/destroy reserved **test_db.sqlite3**, never db.sqlite3. Run one backend test process at a time. Frontend tests use Vitest/jsdom without a browser. Browser walkthroughs supplement automated tests.

## Project structure

```text
frontend/src/app/            Angular routes, components, API service, tests
frontend/src/styles.css      Angular layout adaptations
frontend/angular.json        Build/test settings and production asset URL
frontend/proxy.conf.json     Same-origin API/static development proxy
frontend/package*.json       Pinned dependencies and npm lockfile
frontend/dist/               Generated build (ignored)
config/                     Shared/development/production settings, WSGI/ASGI
bookings/models.py          Domain data and SQL constraints
bookings/services.py        Atomic booking/cancellation rules
bookings/views.py           Write APIs, validation, CSRF errors
bookings/pagination.py      Bounded query parameters and SQL pagination
frontend/src/app/select.ts  Shared styled Status and Per page dropdown
frontend/src/app/page-sizes.ts  Result-count and row-based page choices
bookings/api_views.py       Session auth and staff-only reads
bookings/frontend_views.py  Built Angular entry point
bookings/access.py          Active-staff guard and no-store policy
bookings/auth_views.py      Shared staff form / compatibility login
bookings/static/bookings/   Original CSS, icons, photos, credits
bookings/templates/         Generic errors and compatibility auth templates
bookings/management/        Validated initial CSV loader
bookings/migrations/        Versioned domain schema
bookings/tests/             Backend tests and Angular-shell fixture
```

Old catalogue/booking Django templates, choice forms, and imperative app.js were replaced by Angular. The original CSS remains the shared visual source, bundled by Angular. No domain migration was needed.

## Security and deployment

manage.py defaults to **config.development**: loopback hosts, HTTP, debug off. A private random persistent key is created in ignored `.local/secret-key` when no environment secret exists. Keep it private; Windows uses inherited ACLs. Removing it invalidates sessions. `DJANGO_DEBUG=1` is an explicit local troubleshooting opt-in. `.env` is not loaded automatically.

WSGI/ASGI default to **config.production**, rejecting missing/weak secrets, missing/wildcard hosts, and debug. It enables HTTPS redirects, Secure session/CSRF cookies, HttpOnly/SameSite=Lax sessions, and one-year HSTS including subdomains/preload. Protected responses are no-store. Sessions last one hour and request browser-close expiry; browser restore can preserve cookies. Password creation validates length (12+), similarity, common passwords, and numeric-only values.

Production preparation:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
# Provision a stable DJANGO_SECRET_KEY through your secret manager first.
$env:DJANGO_SETTINGS_MODULE = "config.production"
$env:DJANGO_ALLOWED_HOSTS = "reservations.example.com"  # Your real host.
$env:DJANGO_DEBUG = "0"
.\.venv\Scripts\python.exe manage.py check --deploy --fail-level WARNING
.\.venv\Scripts\python.exe manage.py collectstatic --noinput
```

Deploy the built frontend directory beside Django so it can read index.html. Serve collected `/static/` through the production web server/CDN, and route UI/API paths to Django under the **same HTTPS origin**. Bundles use `/static/angular/`; imagery uses `/static/bookings/`. Deploy index/assets together. Neither development server should be public.

Use a real TLS endpoint and production WSGI/ASGI server. HSTS covers **all subdomains for one year**: all must support HTTPS first. Preload does not automatically submit your domain to browser lists.

Set `DJANGO_TRUST_PROXY=1` only behind a non-bypassable trusted proxy that strips incoming X-Forwarded-Proto, sets it itself, and forwards correct Host. Otherwise leave it unset. Production still needs login throttling, monitoring, backups, and secret rotation. No hosting is provisioned here.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Frontend build required / UI 503 | Run npm ci/build as above, then restart Django. |
| node/npm missing or engine mismatch | Install supported Node, then open a new terminal. |
| PowerShell blocks npm.ps1 | Use `npm.cmd` instead of `npm`. |
| No Django / missing tables | Use .venv Python, install requirements, migrate. |
| Empty choices | Run manage.py load_data. |
| Missing CSS/images locally | Use Django --insecure; keep Django running during Angular dev. |
| Port occupied | Choose another; update the proxy if Django's port changes. |
| CSRF 403 | Keep one host/cookie jar, refresh after login, preserve Host/Origin. |
| API 401 / redirected | Sign in as active staff; session may have expired. |
| Credentials fail | Check staff status; local recovery: manage.py changepassword USERNAME. |
| Database busy | Close database editors/long transactions and retry. |
| Import refuses changed files | Keep live data or back up the stopped DB and seed a fresh one. |

.gitignore excludes secrets, virtual environments, databases, node_modules, build/cache files, local artifacts, the Word brief, and **README.personal.md**. Commit source, migrations, requirements, npm lockfile, public README, CSVs, and photo credits. The personal guide stays local.

References: [Angular setup](https://angular.dev/installation), [Angular security](https://angular.dev/best-practices/security), [Django](https://docs.djangoproject.com/en/5.2/), [SQLite transactions](https://docs.djangoproject.com/en/5.2/ref/databases/#transactions-behavior).
