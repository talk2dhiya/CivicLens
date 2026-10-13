# CivicLens --- Full Implementation Plan for Coding Agent

## 1. Project Overview

**Purpose:** CivicLens is an AI-assisted civic issue reporting and
resolution platform. Citizens report local infrastructure and sanitation
problems, follow their progress, and see issues on a map. Authorities
review, prioritize, update, and verify resolutions.

**Current priority:** Build the frontend and backend. A teammate is
responsible for the road-damage ML model. Do not train models or
download datasets in this workstream.

**Development approach:** Implement incrementally, preserving the
existing project structure and working code. Inspect first, then build
and test one complete feature at a time.

## 2. Instructions for the Coding Agent

1.  Inspect the repository before editing files.
2.  Preserve the existing React + Vite frontend and FastAPI backend
    where present.
3.  Reuse dependencies and patterns where practical. Explain new
    dependencies.
4.  Do not delete, rename, or rewrite unrelated files.
5.  Do not commit or push to Git unless explicitly asked.
6.  Do not add private planning or progress files to the repository
    unless asked.
7.  Implement in phases. Test each phase before starting the next.
8.  After each phase, report changed files, added dependencies, commands
    to run, actual test results, and known issues.
9.  Never claim a feature works unless it has actually been tested.
10. Keep code understandable for a beginner. Avoid unnecessary
    abstractions and overengineering.
11. Keep secrets, API keys, passwords, and environment-specific settings
    out of source control.
12. Do not present fake AI results as real predictions. Until the
    teammate's model is integrated, clearly identify placeholders or
    leave AI outputs unavailable.
13. Ordinary reporting, browsing, and status tracking must work even if
    the ML model is unavailable.
14. If a requirement is ambiguous or a destructive change seems
    necessary, explain and ask before proceeding.

## 3. Planned Technology Stack

Use the existing setup where possible.

-   **Frontend:** React + Vite
-   **Backend:** Python + FastAPI
-   **Database:** SQLite for the initial prototype
-   **Database access:** A simple maintainable approach compatible with
    the current backend; avoid adding an ORM unless useful or already
    present
-   **API communication:** HTTP requests using `fetch` or the existing
    request library
-   **Image uploads:** Multipart form upload with server-side validation
-   **Maps:** Leaflet with OpenStreetMap tiles if the project does not
    already have a map solution
-   **AI integration:** Separate service/adapter boundary for the
    teammate's model, after its interface is agreed
-   **Testing:** Backend endpoint tests and manual end-to-end frontend
    checks, using existing tooling where possible

Do not add authentication providers, cloud storage, PostgreSQL/PostGIS,
email services, or other infrastructure until the basic application
works and the need is confirmed.

## 4. User Roles

### Citizen

-   Submit a civic issue report
-   Attach a compulsory photo (required for problem verification and YOLO recognition)
-   Provide a location and an optional description
-   View issues and their current status
-   Open an issue to see details and status history
-   View relevant issues on a map

### Authority

-   Access an authority-only dashboard after authentication and
    authorization are implemented
-   Review incoming reports
-   Update issue status
-   Add appropriate updates
-   Review duplicate suggestions and priority recommendations when
    implemented
-   Record resolution evidence, such as an after-photo, where supported

### Administrator

-   Approve or manage authority accounts
-   Manage authorized users and basic platform settings

**Security rule:** Hiding a frontend button is not authorization. The
backend must enforce permissions on protected endpoints.

## 5. Issue Categories and Statuses

Initial categories: 1. Road Damage / Potholes 2. Water Leakage 3.
Garbage Overflow 4. Flooding / Waterlogging 5. Broken Streetlights

Validate categories on the backend.

Suggested lifecycle: - `Pending` --- submitted and awaiting review -
`Acknowledged` --- received and accepted for review - `In Progress` ---
work has started - `Resolved` --- authority reports that the issue has
been fixed - `Rejected` --- invalid, out of scope, or duplicate, with a
reason where appropriate

Validate allowed status transitions on the backend. Do not allow
arbitrary status strings.

## 6. Main Application Pages

### Citizen-facing

-   **Home / Overview:** Explain CivicLens and link to report
    submission, reports, and map.
-   **Report an Issue:** Category, description, location, optional
    image.
-   **Issues List:** Browse reports with category/status filters.
-   **Issue Details:** Details, image if available, location, current
    status, and status history.
-   **Map View:** Show geolocated reports and link to each issue.
-   **Authentication:** Sign-in and registration, in a later phase.

### Authority

-   **Authority Dashboard:** Summary counts and incoming reports.
-   **Report Review:** Review a report and update status with
    validation.
-   **Resolution Evidence:** Add an after-photo or resolution note if
    implemented.

### Admin

-   **Authority Account Approval:** Approve or reject authority access
    requests.
-   Restrict this page to authorized administrators.

Do not implement all pages at once. First prove report data persists,
then expand.

## 7. Proposed Backend API

Inspect the current API and preserve compatible routes. Use a consistent
prefix such as `/api/v1` if it can be introduced without breaking
existing work.

### Health

-   `GET /` --- preserve existing root response if present.
-   `GET /health` --- simple health status.

### Reports

-   `POST /api/v1/reports` --- create a report; accept multipart form
    data if an image is included.
-   `GET /api/v1/reports` --- list reports with pagination and optional
    category/status filters.
-   `GET /api/v1/reports/{report_id}` --- retrieve report details.
-   `PATCH /api/v1/reports/{report_id}/status` --- update status;
    authority permission required once authentication exists.
-   `POST /api/v1/reports/{report_id}/resolution-evidence` --- optional
    later endpoint for resolution note/photo.

### Map and statistics

-   `GET /api/v1/map/reports` --- return map-safe report fields and
    coordinates for issues with valid coordinates.
-   `GET /api/v1/statistics/summary` --- status/category counts for
    dashboards.

### Authentication and administration (later)

-   `POST /api/v1/auth/register`
-   `POST /api/v1/auth/login`
-   `POST /api/v1/auth/logout` if required by the chosen approach
-   `GET /api/v1/auth/me`
-   Admin-only endpoints to approve/reject authority accounts

These are planned routes, not a requirement to create all immediately.
Document the actual implemented routes.

## 8. Data Model

Use SQLite initially. Use migrations or a documented schema
initialization approach. Store image paths/storage keys, not image
binary data, in the database.

### Reports table

-   `id` --- primary key
-   `category` --- required, validated
-   `description` --- optional, trimmed, maximum 2000 characters
-   `location_text` --- human-readable location
-   `latitude` --- nullable coordinate
-   `longitude` --- nullable coordinate
-   `image_path` --- required relative path/storage key
-   `status` --- validated lifecycle status, default `Pending`
-   `priority` --- nullable until a defensible prioritization method
    exists
-   `created_at` --- UTC timestamp
-   `updated_at` --- UTC timestamp

### Status history table

-   `id`
-   `report_id`
-   `old_status`
-   `new_status`
-   `changed_by_user_id` --- nullable before authentication exists
-   `note` --- nullable
-   `created_at`

Record status changes rather than only overwriting current status.

### Users table (later)

-   `id`
-   `display_name`
-   `email` --- unique
-   `password_hash` --- never plaintext
-   `role` --- citizen, authority, or admin
-   `account_status` --- pending/active/disabled as appropriate
-   `created_at`

Authority approval may be a user field or separate table. Selecting
"authority" during registration must not automatically grant authority
access.

### Future duplicate grouping

Keep original reports. Do not automatically delete reports classified as
duplicates. Grouping decisions should be traceable.

## 9. Image Upload Requirements

-   Accept common image formats only, such as JPEG, PNG, and WebP.
-   Validate type and size on the server; do not trust the filename or
    browser MIME type alone.
-   Generate server-side filenames.
-   Store uploads in a dedicated directory outside source-code files
    where practical.
-   Return a safe URL/path the frontend can display.
-   Handle missing, oversized, invalid, or failed uploads with useful
    errors.
-   Do not expose arbitrary filesystem paths.
-   A photo is compulsory for all reports to enable issue verification and computer vision recognition.

## 10. Location and Map

-   Support human-readable location from the beginning.
-   Add latitude/longitude for map plotting.
-   Never invent coordinates when only text location is provided.
-   Reports without coordinates must still work in list/details pages.
-   Use Leaflet/OpenStreetMap if appropriate for the existing stack.
-   Keep map popups concise and link to issue details.
-   Avoid exposing a citizen's precise personal location. Record the
    reported public issue location, not the user's home/live location.
-   Follow the map tile provider's usage policy; do not assume unlimited
    free production usage.

## 11. Frontend Quality

-   Consistent visual design, spacing, typography, colors, and reusable
    components.
-   Responsive layout for desktop and mobile.
-   Loading, empty, success, and error states.
-   Validate required fields in the UI for usability and validate again
    on the backend.
-   Accessible labels, keyboard-friendly controls, meaningful button
    labels, and visible focus states.
-   Never show raw stack traces or server internals to users.
-   Do not rely on hardcoded mock reports in the final data flow. If
    sample data is used during development, label it and replace it with
    API data before declaring completion.
-   Make API base URL configurable through environment variables and
    provide an example environment file without secrets.
-   Never put private server secrets in frontend environment variables.

## 12. Authentication and Authorization

Implement after basic report creation/list/detail works.

-   Use a maintained password-hashing approach.
-   Use a suitable session or token strategy and store credentials
    safely.
-   Enforce all permissions on the backend.
-   Citizens can create reports and view public reports.
-   Authority users can review/update reports only after approval.
-   Admins can approve or disable authority accounts.
-   Never trust a role supplied in the frontend request body.
-   Handle login failures sensibly and do not reveal whether a password
    is correct.
-   Email OTP can be added when a real provider and credentials are
    configured. Do not fake successful verification.
-   Do not commit secrets or credentials.

## 13. AI Integration Boundary

A teammate is handling the road-damage model. Do not train or download
the model in this workstream.

When the model contract is available, agree on: - Model file/runtime
requirements - Input image requirements and preprocessing - Output class
labels and confidence values - Bounding-box coordinate format - Error
behavior and expected latency - How model version and inference results
are recorded

Potential later uses: - Detect road damage in submitted images - Return
class, confidence, and bounding boxes - Suggest duplicates using report
text, location, time, and/or image similarity - Provide explainable
priority suggestions - Analyze historical reports for hotspot patterns

An object detector does not independently predict future damage or
verify a repair. Those features need separate data and methods. Do not
automatically reject a report because model confidence is low. Manual
reporting must still work if inference fails.

## 14. Duplicate Detection, Prioritization, and Prediction (Later)

Out of scope for the first working report flow.

### Duplicate detection

-   Start with suggestions using location proximity, category, text
    similarity, and timestamps.
-   Preserve each citizen's report.
-   Allow authorized review before grouping reports.
-   Record grouping decisions.

### Prioritization

-   Start with transparent rule-based prioritization if needed.
-   Document factors and do not present arbitrary scores as objective
    truth.
-   Keep severity, confidence, and priority separate.

### Hotspots and prediction

-   Use valid geolocated historical reports.
-   Document time period, coverage, limitations, and evaluation method.
-   Do not claim reliable prediction without evaluation against
    appropriate held-out data.
-   Keep analytics descriptive if predictive evidence is unavailable.

## 15. Privacy, Security, Reliability

-   Validate and constrain all input.
-   Use parameterized SQL or safe ORM patterns.
-   Restrict CORS to appropriate frontend origins outside local
    development.
-   Enforce backend authorization.
-   Limit upload size and validate file content.
-   Avoid unnecessary personal data.
-   Never store passwords in plaintext or publish tokens, keys, or
    private logs.
-   Return useful errors without internal traces.
-   Store timestamps in UTC and display them appropriately.
-   Make deletion, if ever added, authorized and deliberate.
-   Consider rate limiting and abuse prevention before public
    deployment.
-   Clearly distinguish prototype behavior from production-ready
    security.

## 16. Implementation Phases and Acceptance Criteria

### Phase 0 --- Inspect the project

Tasks: - Inspect frontend/backend structure, routes, dependencies, and
run commands. - Identify existing working features. - Propose a minimal
change plan before major edits.

Acceptance: - Existing code is preserved. - Starting state is summarized
accurately. - Frontend and backend start, or blockers are documented.

### Phase 1 --- Create and persist a report

Tasks: - Add report form. - Add backend validation and
`POST /api/v1/reports`. - Create SQLite schema. - Save reports
persistently. - Support optional validated image upload. - Show
submission success/error states.

Acceptance: - Valid report submits from frontend and is saved by
backend. - Report remains after backend restart. - Invalid input returns
useful errors. - Upload works or blocker is documented. - No unrelated
features are rewritten.

### Phase 2 --- List and view reports

Tasks: - Add list/detail endpoints. - Build list and details page. - Add
category/status filters and loading/empty/error states.

Acceptance: - Reports are loaded from the database, not hardcoded mock
data. - Details match the stored record. - Filters work.

### Phase 3 --- Status workflow and history

Tasks: - Validate status transitions. - Store status history. - Add
authority review UI, protected properly once authentication exists.

Acceptance: - Invalid transitions are rejected. - History persists and
is visible where appropriate. - Updates change the report status and
timestamp.

### Phase 4 --- Map

Tasks: - Add coordinate support. - Build map using Leaflet/OpenStreetMap
if suitable. - Plot only reports with valid coordinates.

Acceptance: - Pins match stored reports. - Reports without coordinates
remain accessible. - Selecting a pin opens the correct report.

### Phase 5 --- Authentication and roles

Tasks: - Add registration/login and secure password hashing. - Add
backend authorization. - Add authority approval and admin controls. -
Add email OTP only with a real provider configured.

Acceptance: - Protected routes reject unauthenticated users. - Citizens
cannot perform authority/admin operations. - Authority accounts require
approval. - No plaintext passwords or secrets.

### Phase 6 --- Authority dashboard

Tasks: - Add summary statistics. - Add review queue and filters. - Add
status updates and resolution notes/photos.

Acceptance: - Dashboard values come from the database. - Restricted
actions require authorization. - Evidence is linked to the correct
report.

### Phase 7 --- Model integration

Tasks: - Coordinate with teammate on inference contract. - Integrate
model behind a separate backend service. - Store inference metadata
where appropriate. - Handle model failure gracefully.

Acceptance: - Model output follows the agreed schema. - Manual reporting
still works if model is unavailable. - Evaluation and limitations are
documented.

### Phase 8 --- Duplicate suggestions, priority, analytics

Tasks: - Add traceable duplicate suggestions/grouping. - Add explainable
prioritization if justified. - Add hotspot analysis and prediction only
when supported by data.

Acceptance: - Original reports are preserved. - Scores/suggestions have
documented meaning. - Analytics use real data and state limitations.

### Phase 9 --- Final integration and documentation

Tasks: - Run frontend and backend together. - Test core workflows. -
Document setup, environment variables, database creation, uploads,
routes, limitations, and model integration. - Check for secrets and
accidental generated data.

Acceptance: - A new developer can follow setup instructions. - Core
workflows pass documented tests. - Known issues are listed honestly. -
No Git push or commit unless explicitly requested.

## 17. Minimum Testing Checklist

Test at least: - Backend starts. - Frontend starts. - Health endpoint
responds. - Valid report submission succeeds. - Missing required fields
are rejected. - Unsupported categories are rejected. - Oversized/invalid
images are rejected. - Reports persist after backend restart. -
List/detail endpoints return correct data. - Invalid report IDs return a
suitable not-found response. - Filters return expected reports. -
Invalid status values/transitions are rejected. - Unauthorized users
cannot perform protected actions after auth is implemented. - Reports
without coordinates do not break the map. - Frontend displays API errors
clearly. - Existing working routes and screens still function.

Use automated tests where practical, plus manual end-to-end checks.

## 18. Suggested Workflow for the Agent

For each task: 1. Inspect the relevant files. 2. State the small change
being made. 3. Implement only that change. 4. Run relevant tests or
commands. 5. Report actual outcomes and remaining problems. 6. Wait for
review before moving to a much larger phase if the codebase or
environment is uncertain.

**Immediate next task:** Complete Phase 0, then implement and test Phase
1 only. Do not build every planned feature in one pass.

## 19. Conceptual Project Structure

Preserve the actual repository layout if it differs. This is a
conceptual target, not a requirement to rename files:

``` text
CivicLens/
├── frontend/                 # React + Vite
├── backend/                  # FastAPI
├── models/
│   ├── vision/               # Teammate's model integration/artifacts
│   ├── text/                 # Future text-related components
│   └── prediction/           # Future analytics/prediction
├── datasets/
│   └── README.md
├── notebooks/
├── results/
├── requirements.txt
└── README.md
```

Do not put datasets, large model weights, user uploads, local databases
containing real user data, `.env` files, or credentials into Git by
default. Inspect and update `.gitignore` appropriately.

## 20. Final Guidance

Prioritize a small, demonstrably working full-stack application over
many incomplete features.

**First milestone:** Submit a report through React, validate it in
FastAPI, save it to SQLite, and retrieve it again. Build the remaining
platform on top of that verified foundation.
