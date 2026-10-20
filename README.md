# FreelanceFlow

FreelanceFlow is a full-stack workspace for freelancers to manage clients, projects, tasks, time tracking, and invoices. It includes a financial dashboard and PDF invoice downloads for Pro accounts.

- **Live application:** https://freelanceflow-steel.vercel.app/
- **Source repository:** https://github.com/Atharva16bit/FreelanceFlow
- **Developer:** Atharva
- **Deployment:** Vercel with Neon PostgreSQL

## Features

| Module | Implemented functionality |
| --- | --- |
| Authentication | Registration, login, logout, and persistent database-backed sessions |
| Clients | Create, view, edit, and delete clients; Free accounts can create up to two clients |
| Projects | Client-linked projects, active/completed status, budget, and work-value estimates |
| Tasks | Project-linked tasks, due dates, and todo/in-progress/completed status |
| Timer | Start and stop a timer; recover the running timer after a page refresh; one running timer per user |
| Time logs | Add manual entries, view finished entries, filter by project, and paginate results |
| Invoices | Select unbilled time entries, create invoices, view details, and mark invoices paid or unpaid |
| PDF downloads | Download an owned invoice as a PDF with a Pro account |
| Dashboard | Active projects, invoice totals, overdue work, upcoming tasks, and a six-month financial overview |
| Demo data | Repeatable setup of a dedicated Pro demonstration account |

Clients, projects, tasks, time entries, invoices, and dashboard results are scoped to the signed-in user. Attempts to access another user's individual records return a not-found response.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express, CommonJS |
| Database | PostgreSQL; Neon for the hosted deployment |
| Authentication | bcrypt, express-session, connect-pg-simple |
| Validation and middleware | Zod, Helmet, express-rate-limit |
| PDF generation | PDFKit |
| Hosting and source control | Vercel, Git, GitHub |

## How the application works

The React frontend calls same-origin `/api` endpoints. Express validates requests, reads the user's session, checks record ownership, and queries PostgreSQL. Sessions are stored in the `user_sessions` table.

Locally, Vite forwards `/api` requests to the backend on port 5000. On Vercel, the frontend is built into `frontend/dist`, and API requests are routed to the Express entry point in `api/index.js`.

Database relationships:

- A user owns clients; each client has projects; each project has tasks and time entries.
- A time entry also records the user who created it.
- An invoice belongs to a user and client and contains invoice items linked to selected time entries.
- An invoice item stores a snapshot of the project name, description, times, and hourly rate.

## Repository structure

```text
FreelanceFlow/
├── api/
│   └── index.js                 # Vercel Express entry point
├── backend/
│   ├── db/schema.sql            # Schema-only database export
│   ├── server.js                # Express configuration and local startup
│   ├── auth.js
│   ├── clients.js
│   ├── projects.js
│   ├── tasks.js
│   ├── timeEntries.js
│   ├── invoices.js
│   ├── createInvoice.js
│   ├── invoiceViews.js
│   ├── invoiceStatus.js
│   ├── invoicePdf.js
│   ├── dashboard.js
│   ├── seedDemo.js
│   ├── buildFrontend.js          # Separate frontend-copy build helper
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── Clients.jsx
│   │   ├── Projects.jsx
│   │   ├── Tasks.jsx
│   │   ├── Timer.jsx
│   │   ├── TimeLogs.jsx
│   │   ├── Invoices.jsx
│   │   ├── InvoiceCreator.jsx
│   │   ├── Dashboard.jsx
│   │   ├── RevenueChart.jsx
│   │   └── api.js
│   └── vite.config.js
├── docs/progress.md              # Development history and test notes
└── vercel.json                   # Root deployment configuration
```

## Run locally on Windows

The following commands use PowerShell. The original development environment used Node.js 26.7, npm 11.19, and PostgreSQL 18. Use a Node.js version supported by the installed Vite release. The schema was exported using PostgreSQL 18 tools.

### 1. Clone the repository

```powershell
git clone https://github.com/Atharva16bit/FreelanceFlow.git
Set-Location FreelanceFlow
```

For the original project location, use:

```powershell
Set-Location "E:\Persevex\Projects\FreelanceFlow"
```

Run subsequent commands from this project root unless a step changes the directory.

### 2. Create the database and application role

Open PostgreSQL's command-line client from PowerShell:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres
```

At the `postgres=#` prompt, run the following commands **only for a new setup**:

```sql
CREATE ROLE freelanceflow_app WITH LOGIN;
\password freelanceflow_app
CREATE DATABASE freelanceflow OWNER freelanceflow_app;
\q
```

The `\password` command asks for the new application-role password twice. Password input is hidden: characters and asterisks do not appear while typing. Keep this password for the backend configuration. Do not type terminal prompts such as `postgres=#` as commands.

### 3. Import the schema

Back in PowerShell, from the project root:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
    -h 127.0.0.1 -p 5432 -U freelanceflow_app -d freelanceflow `
    --set=ON_ERROR_STOP=1 --single-transaction `
    --file=".\backend\db\schema.sql"

if ($LASTEXITCODE -ne 0) { throw "Schema import failed." }
```

Import into an empty database. The schema export is not an incremental migration and does not include account or business data.

### 4. Configure the backend

Create `backend/.env` with the following keys. Replace the two password/secret values with your own values before starting the server:

```dotenv
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=freelanceflow
DB_USER=freelanceflow_app
DB_PASSWORD=your_application_role_password
SESSION_SECRET=your_random_session_secret_at_least_32_characters
```

Generate a random session secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For a hosted database, set `DATABASE_URL` instead of the individual `DB_*` settings. When present, `DATABASE_URL` takes precedence. Use the complete PostgreSQL connection URI, including its required SSL settings. Keep `.env`, database credentials, and session secrets out of Git.

### 5. Install dependencies

From the project root:

```powershell
npm ci --prefix backend
npm ci --prefix frontend --include=dev
```

### 6. Start the backend

In one terminal, from the project root:

```powershell
Set-Location backend
npm start
```

Expected address: `http://127.0.0.1:5000`.

Leave this terminal running. For automatic restarts while editing backend files, use `npm run dev` instead of `npm start`.

### 7. Start the frontend

Open a second terminal at the project root:

```powershell
Set-Location frontend
npm run dev
```

Open **http://localhost:5173/** in a browser. Use this frontend address for local browser workflows so the Vite API proxy handles requests and session cookies consistently.

To check backend database connectivity, open **http://127.0.0.1:5000/api/health**. A successful response is:

```json
{"status":"ok","database":"connected"}
```

## Demonstration account

The deployed demonstration account uses the email **demo@freelanceflow.example**. Obtain its password from the project owner.

For your own database, configure `backend/.env`, then run the seed script from the project root:

```powershell
Set-Location backend
$env:DEMO_PASSWORD = Read-Host "Choose a demo password of at least 12 characters"
try {
    npm run seed:demo
    if ($LASTEXITCODE -ne 0) { throw "Demo setup failed." }
} finally {
    Remove-Item Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
}
```

The password must contain at least 12 characters and fit within bcrypt's 72-byte limit. This setup prompt displays input; do not share its terminal output.

On a fresh database, the seed creates a Pro account with:

- Three clients, three projects, and three tasks.
- Five paid invoices and one unpaid invoice.
- One unbilled time entry.
- Initial collected revenue of INR 10,000 and an outstanding amount of INR 2,000.

Dates are relative to the first seed run. Demo totals can change when someone edits the shared account. If the demo email already exists, the script leaves its records and password unchanged; rerunning it does not reset the workspace.

To seed Neon, temporarily supply its complete connection URI through the `DATABASE_URL` environment variable before running the script. Remove that temporary environment variable afterward if you want subsequent local commands to use the local database.

## Important business rules

- Free accounts may have at most two clients. PDF invoice downloads require Pro. The application does not include a paid subscription checkout or self-service upgrade flow.
- A user can have only one running timer, enforced by a partial unique database index. Starting a timer requires an owned, active project.
- Manual time entries must finish after they start and cannot contain future times. Overlapping entries are currently allowed.
- Only finished, unbilled time entries can be invoiced. A unique constraint prevents a time entry from being billed twice.
- Invoice creation uses a database transaction and saves client and item snapshots. Later changes to a client's hourly rate do not change an existing invoice's saved item rate or amount.
- Invoice item amounts are rounded to two decimal places in PostgreSQL; invoice totals sum those amounts.
- Project work-value estimates use finished time entries and the client's current hourly rate. These estimates can change when the rate changes.
- Linked records prevent deletion of a client or project. The API returns a conflict response instead of deleting dependent records automatically.
- Invoice currency is INR. Business-date calculations and financial month grouping use `Asia/Kolkata`.
- Marking an invoice paid records its payment timestamp. Repeating the paid update preserves that timestamp; restoring unpaid clears it.
- The financial chart groups currently paid invoices by payment month and currently unpaid invoices by issue month. It is not a historical balance or accounting ledger.

## Main API routes

All business routes require a session. Registration, login, and the health check are available without a signed-in session.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register` | Register an account |
| `POST /api/auth/login` | Sign in and create a session |
| `GET /api/auth/me` | Read the signed-in account |
| `POST /api/auth/logout` | Destroy the session |
| `/api/clients` and `/api/clients/:id` | Client listing, creation, lookup, updates, and deletion |
| `/api/projects` and `/api/projects/:id` | Project listing, creation, lookup, updates, and deletion |
| `/api/tasks` and `/api/tasks/:id` | Task listing, creation, lookup, updates, and deletion |
| `GET /api/time-entries/running` | Retrieve the current timer |
| `POST /api/time-entries/start` | Start a timer |
| `POST /api/time-entries/:id/stop` | Stop an owned timer |
| `POST /api/time-entries/manual` | Add a manual time entry |
| `GET /api/time-entries` | List finished entries with filtering and pagination |
| `GET /api/invoices/unbilled` | Preview eligible time entries for a client and date range |
| `POST /api/invoices` | Create an invoice from selected entries |
| `GET /api/invoices` | List owned invoices with pagination |
| `GET /api/invoices/:id` | Retrieve invoice details and items |
| `PATCH /api/invoices/:id/status` | Mark an invoice paid or unpaid |
| `GET /api/invoices/:id/pdf` | Download an owned invoice PDF; Pro only |
| `GET /api/dashboard` | Retrieve dashboard summary and upcoming tasks |
| `GET /api/dashboard/revenue` | Retrieve the six-month financial overview |
| `GET /api/health` | Check database connectivity |

Use JSON request bodies where required. Browser requests use session cookies. PowerShell API tests must retain the session returned by login with `-SessionVariable`, then pass it with `-WebSession`; a browser login does not sign in a separate PowerShell session.

## Checks and verification

Run the frontend checks from the project root:

```powershell
npm run lint --prefix frontend
if ($LASTEXITCODE -ne 0) { throw "Lint failed." }

npm run build --prefix frontend
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

git diff --check
if ($LASTEXITCODE -ne 0) { throw "Whitespace check failed." }
```

Frontend lint and production builds passed during development. Manual API and browser checks covered:

- Successful registration/login, duplicate-email rejection, invalid credentials, unauthenticated requests, and logout.
- Client, project, and task CRUD; owner isolation; the Free client limit; and linked-record deletion conflicts.
- Timer start/stop, duplicate-running-timer rejection, refresh recovery, and saved history.
- Manual-entry validation for reversed and future times, and cross-user access rejection.
- Invoice creation, duplicate-billing rejection, listing/details, payment status changes, and PDF access rules.
- Isolation of dashboard and financial results between accounts.

Live deployment checks confirmed sign-in, session persistence after refresh, dashboard display, PDF download, and timer refresh/stop behavior. These are manual checks; the repository does not currently provide an automated regression test suite. See `docs/progress.md` for development records.

## Vercel and Neon deployment

The current deployment uses the **repository root**, not the `backend` directory.

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Root directory | Repository root (`./`) |
| Install command | `npm ci --prefix backend && npm ci --prefix frontend --include=dev` |
| Build command | `npm run build --prefix frontend` |
| Output directory | `frontend/dist` |
| API entry point | `api/index.js` |
| Database | Neon PostgreSQL |

The root `vercel.json` configures the frontend build and rewrites `/api/:path*` requests to `/api/index`. The frontend-copy helper in `backend/buildFrontend.js` is not the root Vercel deployment build.

Required hosted environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Complete Neon PostgreSQL connection URI with SSL settings |
| `SESSION_SECRET` | A randomly generated secret of at least 32 characters |

Import `backend/db/schema.sql` into the empty hosted database before using the application. Demo data must be seeded separately; schema import alone creates no users. For the current Node PostgreSQL configuration, use `sslmode=verify-full` when explicitly selecting full certificate verification in the connection URI.

After changing environment variables or deployment configuration, deploy again. Verify `/api/health`, login, page refresh, PDF download, and timer recovery against the deployed URL.

## Evaluator walkthrough

1. Open the live application and sign in with the demonstration account supplied by the project owner.
2. Review the dashboard totals, upcoming tasks, and six-month financial overview.
3. Inspect clients, projects, and tasks; view a project's budget and logged-work estimates.
4. Start a timer on an active project, refresh the page, then stop it and check Time logs.
5. Add a finished manual entry and select eligible unbilled work in the invoice creator.
6. Create an invoice, inspect its saved items and total, and download its PDF with the Pro account.
7. Mark the invoice paid or unpaid and refresh the dashboard to inspect the resulting totals.
8. Sign out and confirm that account data requires login.

The demo workspace is shared and editable, so use clearly labelled demonstration records and expect totals to differ from the initial seed values.

## Development milestones

| Milestone | Delivered scope |
| --- | --- |
| Week 1 | Setup, authentication, client/project/task APIs and browser screens |
| Week 2 | Timer, manual time entries, time history, and project budget estimates |
| Week 3 | Invoice creation, billing safeguards, status updates, and PDF downloads |
| Week 4 | Dashboard, financial overview, repeatable demo data, and hosted deployment |

## Current limitations

- Payments are recorded manually; there is no payment gateway, subscription billing, tax engine, or accounting integration.
- There is no password-reset or email-verification workflow.
- Rate limiting uses the application's current middleware setup; distributed rate limiting for serverless instances is not implemented.
- An automated regression suite, load testing, a full security review, and a database restore rehearsal have not been completed.
- Finished time-entry editing/deletion and overlap prevention are not implemented.
- Client and project list endpoints currently return up to 100 records; some dependent views require manual refresh after changes.
- The hosted demo is intended for evaluation. Further operational and security work is needed before treating it as a production service for real customer data.
