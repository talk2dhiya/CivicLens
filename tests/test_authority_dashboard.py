"""
Unit and integration tests for Authority Dashboard, Resolution Evidence Workflow,
and Summary Statistics (Phase 6).
"""

import io
import uuid
import pytest
from fastapi import HTTPException, UploadFile
from backend.main import (
    RegisterRequest,
    StatusUpdateRequest,
    register_endpoint,
    update_status_endpoint,
    submit_resolution_evidence_endpoint,
    get_statistics_summary_endpoint,
    require_approved_authority_or_admin,
)
from backend.database import (
    create_report,
    get_report_by_id,
    get_statistics_summary,
    get_user_by_email,
)
from backend.services.auth import seed_initial_admin


@pytest.fixture(scope="module", autouse=True)
def setup_seed():
    seed_initial_admin()


def test_resolved_status_requires_proof_photo_and_note():
    # 1. Create a test report
    rep = create_report(
        category="Road Damage / Potholes",
        description="Pothole on 4th cross",
        location_text="4th Cross Road",
        latitude=12.9165,
        longitude=79.1325,
        image_path="/uploads/test_pothole.jpg",
    )
    rep_id = rep["id"]

    # Transition to In Progress first (Pending -> Acknowledged -> In Progress)
    admin_user = get_user_by_email("admin@civiclens.local")
    update_status_endpoint(
        report_id=rep_id,
        payload=StatusUpdateRequest(status="Acknowledged", note="Acknowledged by road squad"),
        current_user=admin_user,
    )
    update_status_endpoint(
        report_id=rep_id,
        payload=StatusUpdateRequest(status="In Progress", note="Repair crew dispatched"),
        current_user=admin_user,
    )

    # Attempt to resolve WITHOUT resolution_image_path -> must fail with 400
    with pytest.raises(HTTPException) as exc:
        update_status_endpoint(
            report_id=rep_id,
            payload=StatusUpdateRequest(status="Resolved", note="Fixed the pothole"),
            current_user=admin_user,
        )
    assert exc.value.status_code == 400
    assert "resolution proof photo is strictly compulsory" in exc.value.detail

    # Attempt to resolve WITH resolution_image_path but WITHOUT note (or note < 5 chars) -> must fail
    with pytest.raises(HTTPException) as exc:
        update_status_endpoint(
            report_id=rep_id,
            payload=StatusUpdateRequest(
                status="Resolved",
                note="Ok",
                resolution_image_path="/uploads/fixed_road.jpg",
            ),
            current_user=admin_user,
        )
    assert exc.value.status_code == 400
    assert "completion note of at least 5 characters" in exc.value.detail

    # Resolve WITH both photo and valid note -> must succeed
    resolved_rep = update_status_endpoint(
        report_id=rep_id,
        payload=StatusUpdateRequest(
            status="Resolved",
            note="Asphalt repaved and steamrolled completely.",
            resolution_image_path="/uploads/fixed_road.jpg",
        ),
        current_user=admin_user,
    )
    assert resolved_rep["status"] == "Resolved"
    assert resolved_rep["resolution_image_path"] == "/uploads/fixed_road.jpg"
    assert resolved_rep["resolution_note"] == "Asphalt repaved and steamrolled completely."
    assert resolved_rep["resolved_at"] is not None


@pytest.mark.anyio
async def test_resolution_evidence_multipart_upload():
    # Create report and progress to In Progress
    rep = create_report(
        category="Garbage Overflow",
        description="Overflowing dumpster near park",
        location_text="Park Gate 3",
        latitude=12.9200,
        longitude=79.1300,
        image_path="/uploads/garbage.jpg",
    )
    admin_user = get_user_by_email("admin@civiclens.local")
    update_status_endpoint(
        report_id=rep["id"],
        payload=StatusUpdateRequest(status="Acknowledged", note="Acknowledged"),
        current_user=admin_user,
    )
    update_status_endpoint(
        report_id=rep["id"],
        payload=StatusUpdateRequest(status="In Progress", note="Truck on way"),
        current_user=admin_user,
    )

    # Mock multipart image upload
    fake_png_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    upload_file = UploadFile(
        file=io.BytesIO(fake_png_data),
        filename="after_cleanup.png",
        headers={"content-type": "image/png"},
    )

    resolved = await submit_resolution_evidence_endpoint(
        report_id=rep["id"],
        image=upload_file,
        note="Sanitation team cleared all waste and sanitized container.",
        current_user=admin_user,
    )
    assert resolved["status"] == "Resolved"
    assert resolved["resolution_image_path"].startswith("/uploads/res_")
    assert resolved["resolution_note"] == "Sanitation team cleared all waste and sanitized container."
    assert resolved["resolved_at"] is not None


def test_statistics_summary_kpis():
    stats = get_statistics_summary_endpoint()
    assert "total_reports" in stats
    assert stats["total_reports"] >= 2
    assert "status_counts" in stats
    assert "Pending" in stats["status_counts"]
    assert "Resolved" in stats["status_counts"]
    assert "category_counts" in stats
    assert "active_hotspots_count" in stats
    assert "reports_in_hotspots_count" in stats
    assert stats["status_counts"]["Resolved"] >= 2


def test_department_filtered_statistics():
    roads_stats = get_statistics_summary_endpoint(department="Roads & Infrastructure")
    assert roads_stats["filter_department"] == "Roads & Infrastructure"
    assert roads_stats["filter_category"] == "Road Damage / Potholes"
    assert "status_counts" in roads_stats
