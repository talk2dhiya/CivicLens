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

## 3. Duplicate Handling, Mapping & Privacy

- **Preservation of Reports**: Duplicate citizen reports are never deleted. High-confidence duplicates are linked together, while uncertain matches are flagged for manual review.
- **Public Map**: Displays high-level status, category, and *approximate* location.
- **Citizen Privacy**: Citizen identities, personal contact information, exact coordinates, and sensitive details are never exposed on public maps or public views.

---

## 4. Proposed Technical Stack

| Component | Technology | Purpose / Rationale |
|---|---|---|
| **Frontend** | React | Responsive web UI for citizen reporting and administrative portals. |
| **Backend API** | Python (FastAPI) | High-performance, asynchronous REST API with automatic OpenAPI documentation. |
| **Database** | PostgreSQL + PostGIS | Robust relational database with spatial extensions for geospatial queries. |
| **Maps** | Mapping library (e.g., Leaflet / OpenStreetMap) | Interactive location selection for reports and public issue visualizer. |
| **AI / ML** | Python (PyTorch / YOLOv8 / Scikit-Learn) | Image-based issue classification, text/location duplicate detection, and geographic hotspot clustering (DBSCAN). |

---

## 5. Phased AI Implementation Strategy

AI capabilities will be introduced **incrementally** after the core reporting, authentication, and workflow foundation is stable and tested:
1. **Phase 1**: Conventional reporting, email OTP authentication, department routing, and status transitions.
2. **Phase 2**: Duplicate report clustering (text similarity + spatial proximity).
3. **Phase 3**: Image-based issue classification / severity assessment (fine-tuned models).
4. **Phase 4**: Hotspot identification (DBSCAN) and predictive analytics using historical resolution data.

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
