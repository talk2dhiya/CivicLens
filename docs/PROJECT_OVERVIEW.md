# CivicLens — Project Overview

## 1. Project Introduction
**CivicLens** is an AI-Powered Neighborhood Intelligence & Response Platform developed as a student IDP project. It bridges the gap between citizens reporting local civic infrastructure issues and municipal authorities reviewing, prioritising, and resolving them. 

The initial milestone focuses on a single city with a reliable, end-to-end operational workflow before layering advanced AI capabilities.

### Core Problem Addressed
Civic grievances are frequently fragmented across multiple informal channels, prone to duplication, slow to address, lack clear prioritization, and provide citizens with little to no visibility into resolution progress.

### Initial Complaint Categories
- **Road damage / Potholes**
- **Water leaks**
- **Garbage overflow**
- **Flooding / Waterlogging**
- **Broken streetlights**

---

## 2. User Roles & Core Workflows

### Citizens
- **Authentication**: Sign up and sign in using Email OTP.
- **Issue Submission**: Report an issue with category, location details, compulsory photo upload (for verification and YOLO recognition), and an optional description.
- **Tracking**: Track status lifecycle in real-time and verify which department has taken ownership.
- **Resolution Verification**: Review the official resolution photo uploaded by the authority and confirm or dispute the resolution.

### Authorities
- **Authentication & Approval**: Sign in via Email OTP. Authority accounts strictly require administrator approval before activation (email OTP verifies inbox access, not official authority credentials).
- **Role-Based Access Control (RBAC)**: Authority accounts only view issues routed to their designated department (e.g., Roads & Infrastructure department does not see water pipeline leaks).
- **Complaint Management**: Update statuses, review issues, upload resolution proof photos, and maintain an audit log of status transitions.

### Complaint Lifecycle Statuses
1. `Submitted` — Report logged by citizen.
2. `Under review` — Department reviewing validity and priority.
3. `Accepted` — Issue accepted and queued for action.
4. `In progress` — Ground teams dispatched or work underway.
5. `Resolved` — Work completed with attached resolution proof photo.
6. `Rejected` — Deemed invalid, duplicate, or out of scope with documented reason.

---

## 3. Duplicate Handling, Mapping, Hotspots & Privacy

- **Preservation of Reports**: Duplicate citizen reports are never deleted. High-confidence duplicates are linked together, while uncertain matches are flagged for manual review.
- **Interactive Map & Hotspot Layer**:
  - Dynamically fits bounds to valid report coordinates, with a configurable fallback city placeholder (Vellore, Tamil Nadu) when empty.
  - Supports individual markers and multi-level marker clustering using Leaflet and OpenStreetMap.
  - Displays **Hotspots** as a distinct visual layer (translucent circular area around cluster centroids with summary popups), calculated by an independent backend DBSCAN service.
  - Distinguishes isolated reports from clusters without silently discarding noise reports.
  - **Disclaimer**: Hotspots indicate concentrations of submitted reports, not verified physical danger, severity, or future risk.
- **Citizen Privacy**: Citizen identities, personal contact information, exact home locations, and sensitive details are never exposed on public maps or public views. Public reports display the issue location only.

---

## 4. Proposed Technical Stack

| Component | Technology | Purpose / Rationale |
|---|---|---|
| **Frontend** | React + Vite | Responsive web UI for citizen reporting, issue browsing, and interactive map exploration. |
| **Backend API** | Python (FastAPI) | High-performance, asynchronous REST API with automatic OpenAPI documentation. |
| **Database** | SQLite (Prototype) / PostgreSQL + PostGIS (Production) | Simple serverless SQLite file for initial prototype; spatial PostgreSQL for enterprise scaling. |
| **Maps** | Leaflet + OpenStreetMap (`react-leaflet`, `leaflet.markercluster`) | Interactive location selection for reports, marker clustering, and hotspot visualization layer. |
| **Hotspot Analytics** | Python (`scikit-learn` DBSCAN + Haversine) | Dedicated backend service for geographic report concentration clustering, independent of vision models. |
| **Computer Vision (AI)** | Python (PyTorch / YOLOv8) | Separate teammate workstream for image-based road damage detection and bounding box extraction. |

---

## 5. Phased Implementation Strategy

Capabilities are introduced **incrementally** across structured phases:
1. **Phase 1**: Core reporting with compulsory photo upload, optional description, SQLite storage, and validation.
2. **Phase 2**: Report browsing with category/status filters and full-view details.
3. **Phase 3**: Status workflow state machine (`Pending` -> `Acknowledged` -> `In Progress` -> `Resolved`/`Rejected`), audit history, and authority actions.
4. **Phase 4**: Interactive Map with Leaflet marker clustering and independent DBSCAN geographic hotspot clustering backend service.
5. **Phase 5**: Authentication, email OTP, and role-based permissions (Citizen, Authority, Admin).
6. **Phase 6**: Authority dashboard and resolution proof evidence verification.
7. **Phase 7**: Vision model integration (teammate's road damage YOLO model).
8. **Phase 8**: Duplicate report grouping and advanced predictive analytics.

---

## 6. Directory Structure

```text
CivicLens/
├── docs/                     # Project documentation and specifications
│   └── PROJECT_OVERVIEW.md   # System requirements and technical stack summary
├── frontend/                 # React web application
├── backend/                  # FastAPI backend service
├── ml/                       # Machine learning notebooks, models, and scripts
└── README.md                 # Root repository README
```
