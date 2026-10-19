# FreelanceFlow — Development Record

## Stage 1: Project Setup and Database Connection

### Completed

- Created the project at E:\Persevex\Projects\FreelanceFlow.
- Initialized Git and the backend npm project.
- Installed Express, pg, and dotenv.
- Created the PostgreSQL database: freelanceflow.
- Created a dedicated application login: freelanceflow_app.
- Configured database credentials through backend/.env.
- Added .gitignore to exclude credentials and dependencies.
- Created an Express server with GET /api/health.

### Verification

- Backend started at http://127.0.0.1:5000.
- PostgreSQL connection succeeded.
- GET /api/health returned:
  {"status":"ok","database":"connected"}

### Issue Resolved

PostgreSQL administrator login initially failed.
Reset the password and removed the temporary authentication rule.
Verified that the application account could connect.

### Explanation for Project Lead

The browser sends a request to our Express backend.
The backend queries PostgreSQL and returns a successful response
when the database is reachable.

### Evidence

Capture a screenshot of the browser health response and the
terminal showing successful backend startup.
Keep credentials out of screenshots.

## Stage 2: Authentication

### Implemented

- User registration with input validation.
- Password hashing using bcrypt with cost factor 12.
- Unique email enforcement.
- Login with PostgreSQL-backed sessions.
- Session regeneration on login.
- GET /api/auth/me to identify the logged-in user.
- Logout that destroys the session and clears its cookie.
- Registration and login request limits.
- HttpOnly and SameSite=Lax session cookies.

### Verified Results

| Test                                | Result                |
| ----------------------------------- | --------------------- |
| Valid registration                  | User created          |
| Duplicate email                     | HTTP 409              |
| Password shorter than 12 characters | HTTP 400              |
| Valid login                         | User details returned |
| Saved session after backend restart | User details returned |
| Request without session cookie      | HTTP 401              |
| Logout                              | Success message       |
| Access after logout                 | HTTP 401              |

### Issues Resolved

- Session middleware was initially placed after authentication routes.
  Moved it before the routes so req.session is available.
- The /me route was initially below return router.
  Moved all routes before the return statement.

### Explanation for Project Lead

Registration stores a password hash instead of the actual password.
Login checks the password and creates a session stored in PostgreSQL.
Subsequent requests use a cookie to identify that session.
Logout deletes the session, preventing further authenticated access.

### Remaining Authentication Checks

- Incorrect password must return HTTP 401.
- Unknown email must return HTTP 401.

## Stage 3: Client Management — Create and List

### Implemented

- Clients linked to their owning user.
- Protected client listing and creation endpoints.
- Input validation and exact decimal hourly rates.
- Free plan limit of two clients.
- Transaction and user-row lock to enforce the creation limit.

### Verified Results

- Initial client list was empty.
- Created Aarna and Parth successfully.
- Third client creation returned HTTP 403.
- A separate user, Sai, received an empty client list.

### Explanation for Project Lead

The backend gets the owner's ID from the login session.
Client queries filter by that ID so users see their own records.
The backend also checks the user's plan before creating a client.

### Remaining Work

- View an individual client.
- Edit a client.
- Delete a client.
- Verify cross-user access is blocked for each operation.

### Additional Verified Results

- Owner retrieved an individual client successfully.
- Owner updated the client's phone and hourly rate.
- Another user's view, edit, and delete attempts returned HTTP 404.
- Owner deleted a disposable client successfully.
- Retrieving the deleted client returned HTTP 404.

## Stage 4: Project Management

### Implemented and Verified

- Created projects under an owned client.
- Listed only the logged-in user's projects.
- Retrieved an individual project.
- Updated its description and budget.
- Deleted a temporary project; subsequent retrieval returned HTTP 404.
- Another user's create, view, edit, and delete attempts were blocked.

### Explanation for Project Lead

Each project belongs to a client. The backend checks the client's
owner before allowing project access or modification.

## Stage 5: Task Management

### Implemented and Verified

- Created a task under an owned project.
- Retrieved the task and updated its status to in_progress.
- Preserved its due date as YYYY-MM-DD.
- Listed the owner's tasks; another user received an empty list.
- Blocked another user's create, view, edit, and delete attempts.
- Deleted a temporary task successfully.
- Retrieving the deleted task returned HTTP 404.

### Explanation for Project Lead

Tasks belong to projects, and projects belong to clients.
The backend checks the client's owner before allowing task access.

## Week 1 Status

Backend CRM functionality is implemented and tested through API requests.
Frontend authentication and CRM screens remain to be built.

## Stage 6: Frontend Authentication and Client Management

### Verified in the Browser

- Login, logout, and session persistence after refresh.
- Displayed the logged-in user's clients.
- Edited a client's hourly rate; the change survived refresh.
- Blocked a third client on the Free plan.
- A second account displayed an empty client list.
- Created and deleted a temporary client.
- The deleted client remained absent after refresh.

### Implementation

React calls the Express API through Vite's /api proxy.
A shared API helper handles requests and errors.
Client forms display backend validation and plan-limit errors.
Deletion requires confirmation.

## Week 1 Completion — 18 October 2026

### Browser Verification

- Registration, login, logout, and session persistence passed.
- Client, project, and task CRUD workflows passed.
- Changes persisted after browser refresh.
- Free plan blocked a third client.
- Linked projects prevented client deletion.
- Linked tasks prevented project deletion.

### Code Checks

- npm run lint: passed with no reported issues.
- npm run build: passed.

### Status

Week 1 authentication and CRM milestone completed locally.
Deployment and production security review remain pending.

### Next Milestone

Week 2: persistent timer, manual time entries,
project hours, and budget consumption.

### Browser Timer Recovery — Verified

Started a timer, refreshed the page while it was running,
and confirmed that elapsed time continued from the saved start.
Stopped the timer and verified the saved entry in time-log history.

### Week 2 Status

Core time-tracking milestone completed locally:
persistent timer, manual entries, time-log history,
project hours, and budget-consumption estimates.

Budget estimates use current client rates.
Invoice rate snapshots and duplicate-billing protection
will be implemented during Week 3.

## Week 3: Invoicing — 19 October 2026

### Implemented and Verified

- Previewed finished, unbilled entries by client and date range.
- Created invoices and saved line items in one database transaction.
- Prevented duplicate billing with a unique time-entry constraint.
- Excluded billed entries from subsequent previews.
- Saved client details, hourly rates, durations, and line amounts.
- Verified that changing the current client rate did not alter FF-1.
- Listed and retrieved invoices with ownership protection.
- Updated paid/unpaid status with persistent browser results.
- Repeated paid updates preserved the original payment timestamp.
- Generated and downloaded invoice PDFs through API and browser.
- Blocked Free-plan PDF access and cross-user PDF access.
- Created an invoice from selected entries through the browser.
- Frontend lint and production build passed.

### Calculation Rules

Invoice totals sum individually rounded line amounts.
Project estimates round the combined work value, so a small
rounding difference can occur.

### Scope

Payment status is recorded manually; no payment gateway is connected.
The demo account was assigned Pro locally for PDF testing.

### Next Milestone

Dashboard, sample data, deployment, final testing, and final report.

## Week 4 — Dashboard and financial overview

Implemented:

- Active-project count.
- Unpaid-invoice count and outstanding amount.
- Collected revenue from invoices currently marked paid.
- Overdue-invoice and overdue-task counts.
- Upcoming unfinished tasks for active projects.
- Six-month financial chart, including months with zero activity.
- India Standard Time boundaries for reporting.

Verified:

- Dashboard API returns Atharva's summary and upcoming tasks.
- Financial API returns six monthly totals.
- Sai's dashboard and financial overview exclude Atharva's data.
- Frontend ESLint check passed.
- Frontend production build passed.

Reporting limitations:

- Payment status is updated manually.
- Monthly figures reflect current invoice statuses, not historical
  month-end balances.
- Browser payment-status/chart refresh verification remains to be recorded.

Remaining:

- Demonstration data and evaluator setup instructions.
- Deployment configuration and security review.
- Deployment and final smoke tests.
- Final project report.
