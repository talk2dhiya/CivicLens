import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status as http_status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.database import (
    ALLOWED_CATEGORIES,
    ALLOWED_TRANSITIONS,
    create_report,
    create_user,
    get_report_by_id,
    get_statistics_summary,
    get_user_by_email,
    get_user_by_id,
    init_db,
    list_map_reports,
    list_reports,
    list_users,
    update_report_status,
    update_user_status,
)
from backend.services.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    seed_initial_admin,
    verify_password,
)
from backend.services.hotspots import find_hotspots

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and seed initial admin account
    init_db()
    seed_initial_admin()
    yield


app = FastAPI(
    title="CivicLens API",
    description="Backend API for CivicLens - AI-Powered Neighborhood Intelligence & Response Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration allowing frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded photos statically
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.get("/")
def read_root():
    return {
        "name": "CivicLens API",
        "status": "online",
        "message": "Welcome to CivicLens - AI-Powered Neighborhood Intelligence & Response Platform",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "database": "sqlite",
    }


@app.get("/api/v1/categories")
def get_categories():
    return {"categories": ALLOWED_CATEGORIES}


# --- Authentication Models & Dependencies ---

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str
    role: str = "citizen"
    department: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Extract and validate JWT Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_user_by_id(int(payload["sub"]))
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
        )
    if user.get("account_status") == "disabled":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled by an administrator.",
        )
    return user


def require_approved_authority_or_admin(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Verify that current user is an active Authority or an Administrator."""
    role = current_user.get("role")
    account_status = current_user.get("account_status")

    if role not in ("authority", "admin"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Only municipal authorities or administrators can update report status.",
        )
    if role == "authority" and account_status != "active":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Your authority account is currently pending administrator approval.",
        )
    return current_user


def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Verify that current user is an Administrator."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Administrator access required.",
        )
    return current_user


# --- Authentication Endpoints ---

@app.post("/api/v1/auth/register", status_code=http_status.HTTP_201_CREATED)
def register_endpoint(payload: RegisterRequest):
    if payload.role not in ("citizen", "authority"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Registration only allows 'citizen' or 'authority'.",
        )
    try:
        pw_hash = hash_password(payload.password)
        new_user = create_user(
            email=payload.email,
            password_hash=pw_hash,
            display_name=payload.display_name,
            role=payload.role,
            department=payload.department,
        )

        access_token = None
        if new_user["account_status"] == "active":
            access_token = create_access_token(
                {
                    "sub": str(new_user["id"]),
                    "email": new_user["email"],
                    "role": new_user["role"],
                    "account_status": new_user["account_status"],
                }
            )

        sanitized_user = {k: v for k, v in new_user.items() if k != "password_hash"}
        return {
            "message": (
                "Registration successful."
                if new_user["account_status"] == "active"
                else "Authority registration submitted. Your account is pending administrator approval before activation."
            ),
            "user": sanitized_user,
            "access_token": access_token,
            "token_type": "bearer" if access_token else None,
        }
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


@app.post("/api/v1/auth/login")
def login_endpoint(payload: LoginRequest):
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if user["account_status"] == "disabled":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled by an administrator.",
        )

    access_token = create_access_token(
        {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
            "account_status": user["account_status"],
        }
    )
    sanitized_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": sanitized_user,
    }


@app.get("/api/v1/auth/me")
def get_me_endpoint(current_user: Dict[str, Any] = Depends(get_current_user)):
    sanitized = {k: v for k, v in current_user.items() if k != "password_hash"}
    return {"user": sanitized}


# --- Admin Authority Approval Endpoints ---

@app.get("/api/v1/admin/authorities")
def list_authorities_endpoint(current_user: Dict[str, Any] = Depends(require_admin)):
    authorities = list_users(role="authority")
    sanitized = [{k: v for k, v in u.items() if k != "password_hash"} for u in authorities]
    return {"authorities": sanitized, "count": len(sanitized)}


@app.patch("/api/v1/admin/authorities/{user_id}/approve")
def approve_authority_endpoint(
    user_id: int, current_user: Dict[str, Any] = Depends(require_admin)
):
    try:
        user = get_user_by_id(user_id)
        if not user or user["role"] != "authority":
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Authority user not found.",
            )
        updated = update_user_status(user_id, "active")
        sanitized = {k: v for k, v in updated.items() if k != "password_hash"}
        return {
            "message": f"Authority '{sanitized['display_name']}' approved successfully.",
            "user": sanitized,
        }
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


@app.patch("/api/v1/admin/authorities/{user_id}/reject")
def reject_authority_endpoint(
    user_id: int, current_user: Dict[str, Any] = Depends(require_admin)
):
    try:
        user = get_user_by_id(user_id)
        if not user or user["role"] != "authority":
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Authority user not found.",
            )
        updated = update_user_status(user_id, "disabled")
        sanitized = {k: v for k, v in updated.items() if k != "password_hash"}
        return {
            "message": f"Authority '{sanitized['display_name']}' rejected/disabled.",
            "user": sanitized,
        }
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


# --- Report Endpoints ---

@app.post("/api/v1/reports", status_code=http_status.HTTP_201_CREATED)
async def submit_report(
    category: str = Form(...),
    location_text: str = Form(...),
    image: UploadFile = File(...),
    description: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    if not image or not image.filename:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Photo attachment is compulsory for reporting an issue.",
        )

    ext = Path(image.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    if image.content_type and image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported MIME type '{image.content_type}'. Must be image/jpeg, image/png, or image/webp.",
        )

    contents = await image.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty.",
        )

    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Image size exceeds 5MB limit ({len(contents) / (1024 * 1024):.2f}MB).",
        )

    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(contents)
    image_rel_path = f"/uploads/{filename}"

    try:
        report = create_report(
            category=category,
            location_text=location_text,
            image_path=image_rel_path,
            description=description,
            latitude=latitude,
            longitude=longitude,
            user_id=current_user["id"],
        )
        return report
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


@app.get("/api/v1/reports")
def get_reports(
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    reports = list_reports(
        category=category,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {"reports": reports, "count": len(reports)}


@app.get("/api/v1/reports/my")
def get_my_reports_endpoint(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch reports submitted by the authenticated user."""
    reports = list_reports(limit=200)
    my_reports = [r for r in reports if r.get("user_id") == current_user["id"]]
    return {"reports": my_reports, "count": len(my_reports)}


@app.get("/api/v1/reports/{report_id}")
def get_single_report(report_id: int):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID {report_id} not found.",
        )
    return report


class StatusUpdateRequest(BaseModel):
    status: str
    note: Optional[str] = None
    resolution_image_path: Optional[str] = None


@app.patch("/api/v1/reports/{report_id}/status")
def update_status_endpoint(
    report_id: int,
    payload: StatusUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_approved_authority_or_admin),
):
    try:
        updated_report = update_report_status(
            report_id=report_id,
            new_status=payload.status,
            user_id=str(current_user["id"]),
            note=payload.note,
            resolution_image_path=payload.resolution_image_path,
        )
        return updated_report
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


@app.post("/api/v1/reports/{report_id}/resolution-evidence")
async def submit_resolution_evidence_endpoint(
    report_id: int,
    image: UploadFile = File(...),
    note: str = Form(...),
    current_user: Dict[str, Any] = Depends(require_approved_authority_or_admin),
):
    """
    Submit mandatory after-repair photo evidence and completion note,
    transitioning the report status to 'Resolved'.
    """
    clean_note = note.strip()
    if not clean_note or len(clean_note) < 5:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="A completion note of at least 5 characters is compulsory when resolving an issue.",
        )

    # Validate image MIME type
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid image format. Supported formats are JPEG, PNG, and WebP.",
        )

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Uploaded resolution image is empty.",
        )
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Image size exceeds the {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB limit.",
        )

    ext = Path(image.filename).suffix.lower() if image.filename else ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    unique_filename = f"res_{uuid.uuid4().hex}{ext}"
    dest_path = UPLOAD_DIR / unique_filename

    with open(dest_path, "wb") as f:
        f.write(image_bytes)

    image_rel_path = f"/uploads/{unique_filename}"

    try:
        updated_report = update_report_status(
            report_id=report_id,
            new_status="Resolved",
            user_id=str(current_user["id"]),
            note=clean_note,
            resolution_image_path=image_rel_path,
        )
        return updated_report
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )


@app.get("/api/v1/statistics/summary")
def get_statistics_summary_endpoint(
    department: Optional[str] = None,
):
    """
    Compute operational KPIs, status counts, category distribution,
    average turnaround time, and active hotspot cluster statistics.
    """
    summary = get_statistics_summary(department=department)
    try:
        hotspots_result = find_hotspots(
            category=summary.get("filter_category"),
            eps_meters=500.0,
            min_samples=3,
        )
        summary["active_hotspots_count"] = len(hotspots_result.get("hotspots", []))
        summary["reports_in_hotspots_count"] = sum(
            len(h.get("report_ids", [])) for h in hotspots_result.get("hotspots", [])
        )
    except Exception:
        summary["active_hotspots_count"] = 0
        summary["reports_in_hotspots_count"] = 0

    return summary


@app.get("/api/v1/map/reports")
def get_map_reports_endpoint(
    category: Optional[str] = None,
    status: Optional[str] = None,
    time_range: str = "all",
):
    """
    Fetch all reports that have valid latitude and longitude coordinates.
    Filtered optionally by category, status, and time range.
    """
    reports = list_map_reports(
        category=category,
        status=status,
        time_range=time_range,
    )
    return {"reports": reports, "count": len(reports)}


@app.get("/api/v1/analytics/hotspots")
def get_hotspots_endpoint(
    category: Optional[str] = None,
    status: Optional[str] = None,
    time_range: str = "all",
    eps_meters: float = 500.0,
    min_samples: int = 3,
):
    """
    Execute DBSCAN clustering on geolocated reports to find geographic hotspots.
    Decoupled from ML road damage models.
    """
    try:
        all_geolocated_reports = list_map_reports()
        result = find_hotspots(
            reports=all_geolocated_reports,
            category=category,
            status=status,
            time_range=time_range,
            eps_meters=eps_meters,
            min_samples=min_samples,
        )
        return result
    except ValueError as err:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

