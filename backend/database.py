import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Database file placed at project root or configurable via DB_PATH
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("CIVICLENS_DB_PATH", str(BASE_DIR / "civiclens.db"))

ALLOWED_CATEGORIES = [
    "Road Damage / Potholes",
    "Water Leakage",
    "Garbage Overflow",
    "Flooding / Waterlogging",
    "Broken Streetlights",
]

ALLOWED_STATUSES = [
    "Pending",
    "Acknowledged",
    "In Progress",
    "Resolved",
    "Rejected",
]

ALLOWED_TRANSITIONS = {
    "Pending": ["Acknowledged", "Rejected"],
    "Acknowledged": ["In Progress", "Rejected"],
    "In Progress": ["Resolved", "Rejected"],
    "Resolved": ["In Progress"],
    "Rejected": ["Pending"],
}


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """Initialize database tables if they do not exist."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                description TEXT,
                location_text TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                image_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                priority TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                old_status TEXT,
                new_status TEXT NOT NULL,
                changed_by_user_id TEXT,
                note TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
            );
            """
        )
        conn.commit()


def create_report(
    category: str,
    location_text: str,
    image_path: str,
    description: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Dict[str, Any]:
    """Create a new civic issue report and log the initial status in history."""
    if category not in ALLOWED_CATEGORIES:
        raise ValueError(
            f"Invalid category '{category}'. Allowed categories are: {', '.join(ALLOWED_CATEGORIES)}"
        )

    if not image_path or not image_path.strip():
        raise ValueError("Photo attachment is compulsory for reporting an issue.")

    clean_description = description.strip() if description else ""
    if clean_description and len(clean_description) > 2000:
        raise ValueError("Description cannot exceed 2000 characters.")

    clean_location = location_text.strip()
    if not clean_location:
        raise ValueError("Location text cannot be empty.")

    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO reports (
                category, description, location_text, latitude, longitude,
                image_path, status, priority, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Pending', NULL, ?, ?)
            """,
            (
                category,
                clean_description,
                clean_location,
                latitude,
                longitude,
                image_path,
                now_iso,
                now_iso,
            ),
        )
        report_id = cursor.lastrowid

        # Insert initial entry in status history
        cursor.execute(
            """
            INSERT INTO status_history (
                report_id, old_status, new_status, changed_by_user_id, note, created_at
            ) VALUES (?, NULL, 'Pending', NULL, 'Report submitted by citizen', ?)
            """,
            (report_id, now_iso),
        )
        conn.commit()

        cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        return dict(row)


def get_report_history(report_id: int) -> List[Dict[str, Any]]:
    """Retrieve full audit history for a report, ordered chronologically."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM status_history WHERE report_id = ? ORDER BY id ASC",
            (report_id,),
        )
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_report_by_id(report_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve a report by ID along with its status history timeline and valid next transitions."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        if not row:
            return None
        report_data = dict(row)
        report_data["history"] = get_report_history(report_id)
        report_data["allowed_transitions"] = ALLOWED_TRANSITIONS.get(
            report_data["status"], []
        )
        return report_data


def update_report_status(
    report_id: int,
    new_status: str,
    note: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate and transition an issue to a new status, recording audit history."""
    if new_status not in ALLOWED_STATUSES:
        raise ValueError(
            f"Invalid status '{new_status}'. Allowed statuses are: {', '.join(ALLOWED_STATUSES)}"
        )

    clean_note = note.strip() if note else None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Report with ID {report_id} does not exist.")

        report = dict(row)
        current_status = report["status"]

        if current_status == new_status:
            raise ValueError(f"Report is already in '{new_status}' status.")

        allowed = ALLOWED_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Invalid status transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions from '{current_status}' are: {', '.join(allowed) if allowed else 'None (terminal)'}."
            )

        if new_status == "Rejected":
            if not clean_note or len(clean_note) < 5:
                raise ValueError(
                    "A rejection note of at least 5 characters is compulsory when rejecting an issue."
                )

        now_iso = datetime.now(timezone.utc).isoformat()

        # Update report status and timestamp
        cursor.execute(
            """
            UPDATE reports
            SET status = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_status, now_iso, report_id),
        )

        # Log transition in audit history
        cursor.execute(
            """
            INSERT INTO status_history (
                report_id, old_status, new_status, changed_by_user_id, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (report_id, current_status, new_status, user_id, clean_note, now_iso),
        )
        conn.commit()

    updated = get_report_by_id(report_id)
    if not updated:
        raise ValueError(f"Failed to fetch updated report {report_id}.")
    return updated


def list_reports(
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List reports with optional category, status, and keyword search filtering."""
    query = "SELECT * FROM reports WHERE 1=1"
    params: List[Any] = []

    if category:
        query += " AND category = ?"
        params.append(category)
    if status:
        query += " AND status = ?"
        params.append(status)
    if search and search.strip():
        query += " AND (location_text LIKE ? OR description LIKE ?)"
        pattern = f"%{search.strip()}%"
        params.extend([pattern, pattern])

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

