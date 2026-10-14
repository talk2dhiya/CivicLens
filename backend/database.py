import os
import sqlite3
from datetime import datetime, timedelta, timezone
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

ALLOWED_ROLES = ["citizen", "authority", "admin"]
ALLOWED_ACCOUNT_STATUSES = ["active", "pending_approval", "disabled"]

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


DEPARTMENT_TO_CATEGORY = {
    "Roads & Infrastructure": "Road Damage / Potholes",
    "Water Supply & Sewerage": "Water Leakage",
    "Solid Waste Management": "Garbage Overflow",
    "Stormwater & Flood Control": "Flooding / Waterlogging",
    "Electrical & Public Lighting": "Broken Streetlights",
}

CATEGORY_TO_DEPARTMENT = {v: k for k, v in DEPARTMENT_TO_CATEGORY.items()}


def init_db() -> None:
    """Initialize database tables if they do not exist."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                department TEXT,
                account_status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                category TEXT NOT NULL,
                description TEXT,
                location_text TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                image_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                priority TEXT,
                resolution_image_path TEXT,
                resolution_note TEXT,
                resolved_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
            );
            """
        )
        # Backward-compatibility column migrations for existing reports tables
        cursor.execute("PRAGMA table_info(reports);")
        report_columns = [row[1] for row in cursor.fetchall()]
        if "user_id" not in report_columns:
            cursor.execute("ALTER TABLE reports ADD COLUMN user_id INTEGER REFERENCES users(id);")
        if "resolution_image_path" not in report_columns:
            cursor.execute("ALTER TABLE reports ADD COLUMN resolution_image_path TEXT;")
        if "resolution_note" not in report_columns:
            cursor.execute("ALTER TABLE reports ADD COLUMN resolution_note TEXT;")
        if "resolved_at" not in report_columns:
            cursor.execute("ALTER TABLE reports ADD COLUMN resolved_at TEXT;")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                old_status TEXT,
                new_status TEXT NOT NULL,
                changed_by_user_id TEXT,
                note TEXT,
                evidence_image_path TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
            );
            """
        )
        cursor.execute("PRAGMA table_info(status_history);")
        history_columns = [row[1] for row in cursor.fetchall()]
        if "evidence_image_path" not in history_columns:
            cursor.execute("ALTER TABLE status_history ADD COLUMN evidence_image_path TEXT;")

        conn.commit()


def create_report(
    category: str,
    location_text: str,
    image_path: str,
    description: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    user_id: Optional[int] = None,
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
                user_id, category, description, location_text, latitude, longitude,
                image_path, status, priority, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', NULL, ?, ?)
            """,
            (
                user_id,
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
            ) VALUES (?, NULL, 'Pending', ?, 'Report submitted by citizen', ?)
            """,
            (report_id, str(user_id) if user_id is not None else None, now_iso),
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
    resolution_image_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate and transition an issue to a new status, recording audit history and resolution proof."""
    if new_status not in ALLOWED_STATUSES:
        raise ValueError(
            f"Invalid status '{new_status}'. Allowed statuses are: {', '.join(ALLOWED_STATUSES)}"
        )

    clean_note = note.strip() if note else None
    clean_res_img = resolution_image_path.strip() if resolution_image_path else None

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

        if new_status == "Resolved":
            if not clean_res_img:
                raise ValueError(
                    "A resolution proof photo is strictly compulsory when marking an issue as Resolved."
                )
            if not clean_note or len(clean_note) < 5:
                raise ValueError(
                    "A completion note of at least 5 characters is compulsory when marking an issue as Resolved."
                )

        now_iso = datetime.now(timezone.utc).isoformat()

        # Update report status, resolution evidence, and timestamp
        if new_status == "Resolved":
            cursor.execute(
                """
                UPDATE reports
                SET status = ?, resolution_image_path = ?, resolution_note = ?, resolved_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_status, clean_res_img, clean_note, now_iso, now_iso, report_id),
            )
        else:
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
                report_id, old_status, new_status, changed_by_user_id, note, evidence_image_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (report_id, current_status, new_status, user_id, clean_note, clean_res_img, now_iso),
        )
        conn.commit()

    updated = get_report_by_id(report_id)
    if not updated:
        raise ValueError(f"Failed to fetch updated report {report_id}.")
    return updated


def get_statistics_summary(department: Optional[str] = None) -> Dict[str, Any]:
    """
    Compute operational KPIs, status breakdown, category breakdown,
    and average resolution turnaround time from the database.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        target_category = DEPARTMENT_TO_CATEGORY.get(department) if department else None

        base_filter = ""
        params: List[Any] = []
        if target_category:
            base_filter = " WHERE category = ?"
            params.append(target_category)

        # 1. Total and Status breakdown
        cursor.execute(f"SELECT status, COUNT(*) as cnt FROM reports{base_filter} GROUP BY status", tuple(params))
        status_rows = cursor.fetchall()
        status_counts = {st: 0 for st in ALLOWED_STATUSES}
        total_reports = 0
        for r in status_rows:
            st = r["status"]
            cnt = r["cnt"]
            total_reports += cnt
            if st in status_counts:
                status_counts[st] = cnt

        # 2. Category breakdown
        cursor.execute(f"SELECT category, COUNT(*) as cnt FROM reports{base_filter} GROUP BY category", tuple(params))
        cat_rows = cursor.fetchall()
        category_counts = {cat: 0 for cat in ALLOWED_CATEGORIES}
        for r in cat_rows:
            c = r["category"]
            if c in category_counts:
                category_counts[c] = r["cnt"]

        # 3. Average resolution turnaround time (in hours)
        res_filter = " WHERE status = 'Resolved' AND resolved_at IS NOT NULL"
        res_params: List[Any] = []
        if target_category:
            res_filter += " AND category = ?"
            res_params.append(target_category)

        cursor.execute(f"SELECT created_at, resolved_at FROM reports{res_filter}", tuple(res_params))
        resolved_rows = cursor.fetchall()
        resolution_durations_sec = []
        for row in resolved_rows:
            try:
                c_dt = datetime.fromisoformat(row["created_at"])
                r_dt = datetime.fromisoformat(row["resolved_at"])
                diff = (r_dt - c_dt).total_seconds()
                if diff >= 0:
                    resolution_durations_sec.append(diff)
            except Exception:
                continue

        avg_resolution_hours = None
        if resolution_durations_sec:
            avg_resolution_hours = round(sum(resolution_durations_sec) / len(resolution_durations_sec) / 3600.0, 1)

        return {
            "total_reports": total_reports,
            "status_counts": status_counts,
            "category_counts": category_counts,
            "average_resolution_hours": avg_resolution_hours,
            "filter_department": department,
            "filter_category": target_category,
        }


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


def list_map_reports(
    category: Optional[str] = None,
    status: Optional[str] = None,
    time_range: str = "all",
) -> List[Dict[str, Any]]:
    """
    Fetch all reports that have valid latitude and longitude coordinates,
    with optional filtering by category, status, and time range.
    """
    query = """
        SELECT id, category, description, location_text, latitude, longitude, image_path, status, priority, created_at, updated_at
        FROM reports
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """
    params: List[Any] = []

    if category and category != "ALL":
        query += " AND category = ?"
        params.append(category)
    if status and status != "ALL":
        query += " AND status = ?"
        params.append(status)

    if time_range in ("7d", "30d", "90d"):
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map[time_range]
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query += " AND created_at >= ?"
        params.append(cutoff)

    query += " ORDER BY id DESC"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def create_user(
    email: str,
    password_hash: str,
    display_name: str,
    role: str,
    department: Optional[str] = None,
    account_status: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new user record."""
    clean_email = email.strip().lower()
    clean_name = display_name.strip()

    if not clean_email or "@" not in clean_email:
        raise ValueError("A valid email address is required.")
    if not clean_name:
        raise ValueError("Display name cannot be empty.")
    if role not in ALLOWED_ROLES:
        raise ValueError(
            f"Invalid role '{role}'. Allowed roles are: {', '.join(ALLOWED_ROLES)}"
        )

    # Authorities start as 'pending_approval' by default unless specified
    if account_status is None:
        account_status = "pending_approval" if role == "authority" else "active"

    if account_status not in ALLOWED_ACCOUNT_STATUSES:
        raise ValueError(
            f"Invalid account_status '{account_status}'. Allowed statuses: {', '.join(ALLOWED_ACCOUNT_STATUSES)}"
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO users (
                    email, password_hash, display_name, role, department,
                    account_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_email,
                    password_hash,
                    clean_name,
                    role,
                    department.strip() if department else None,
                    account_status,
                    now_iso,
                    now_iso,
                ),
            )
            user_id = cursor.lastrowid
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"An account with email '{clean_email}' already exists.")

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row)


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve user by email address."""
    clean_email = email.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (clean_email,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve user by ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def list_users(
    role: Optional[str] = None, account_status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List users filtered optionally by role and account status."""
    query = "SELECT id, email, display_name, role, department, account_status, created_at, updated_at FROM users WHERE 1=1"
    params: List[Any] = []

    if role:
        query += " AND role = ?"
        params.append(role)
    if account_status:
        query += " AND account_status = ?"
        params.append(account_status)

    query += " ORDER BY id DESC"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def update_user_status(user_id: int, new_status: str) -> Dict[str, Any]:
    """Update user account status (e.g. approve authority)."""
    if new_status not in ALLOWED_ACCOUNT_STATUSES:
        raise ValueError(
            f"Invalid status '{new_status}'. Allowed values: {', '.join(ALLOWED_ACCOUNT_STATUSES)}"
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE users
            SET account_status = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_status, now_iso, user_id),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"User with ID {user_id} not found.")
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row)

