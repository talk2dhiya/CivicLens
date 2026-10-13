import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.database import (
    ALLOWED_CATEGORIES,
    ALLOWED_TRANSITIONS,
    create_report,
    get_report_by_id,
    init_db,
    list_reports,
    update_report_status,
)

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database on server startup
    init_db()
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


@app.post("/api/v1/reports", status_code=status.HTTP_201_CREATED)
async def submit_report(
    category: str = Form(...),
    location_text: str = Form(...),
    image: UploadFile = File(...),
    description: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
):
    if not image or not image.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Photo attachment is compulsory for reporting an issue.",
        )

    ext = Path(image.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    if image.content_type and image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported MIME type '{image.content_type}'. Must be image/jpeg, image/png, or image/webp.",
        )

    contents = await image.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty.",
        )

    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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
        )
        return report
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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


@app.get("/api/v1/reports/{report_id}")
def get_single_report(report_id: int):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID {report_id} not found.",
        )
    return report


class StatusUpdateRequest(BaseModel):
    status: str
    note: Optional[str] = None


@app.patch("/api/v1/reports/{report_id}/status")
def update_status_endpoint(report_id: int, payload: StatusUpdateRequest):
    try:
        updated_report = update_report_status(
            report_id=report_id,
            new_status=payload.status,
            note=payload.note,
        )
        return updated_report
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )

