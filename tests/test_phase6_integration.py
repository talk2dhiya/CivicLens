"""
Phase 6 Full End-to-End Integration Test Suite for CivicLens.
Simulates the complete municipal lifecycle:
1. Citizen registration & report submission.
2. Authority registration & administrator approval.
3. Department-specific dashboard KPIs & triage queue.
4. Issue progression (Pending -> Acknowledged -> In Progress).
5. Compulsory resolution proof photo & completion note enforcement.
6. Public resolution audit timeline & turnaround analytics.
"""

import io
import uuid
import pytest
from fastapi import HTTPException, UploadFile
from backend.main import (
    RegisterRequest,
    LoginRequest,
    StatusUpdateRequest,
    register_endpoint,
    login_endpoint,
    get_me_endpoint,
    approve_authority_endpoint,
    update_status_endpoint,
    submit_resolution_evidence_endpoint,
    get_statistics_summary_endpoint,
    get_single_report,
)
from backend.database import (
    create_report,
    get_user_by_email,
)
from backend.services.auth import seed_initial_admin


@pytest.fixture(scope="module", autouse=True)
def setup_seed():
    seed_initial_admin()


@pytest.mark.anyio
async def test_full_authority_resolution_lifecycle():
    admin_user = get_user_by_email("admin@civiclens.local")

    # Step 1: Citizen registers and reports an issue
    citizen_email = f"citizen_{uuid.uuid4().hex[:8]}@example.com"
    cit_reg = register_endpoint(
        RegisterRequest(
            email=citizen_email,
            password="CitizenPassword123!",
            display_name="Local Resident",
            role="citizen",
        )
    )
    citizen_user = cit_reg["user"]

    report = create_report(
        category="Road Damage / Potholes",
        description="Hazardous pothole causing wheel damage",
        location_text="7th Avenue & Cross Road 3",
        latitude=12.9180,
        longitude=79.1350,
        image_path="/uploads/citizen_damaged_road.jpg",
        user_id=citizen_user["id"],
    )
    report_id = report["id"]
    assert report["status"] == "Pending"
    assert report["resolution_image_path"] is None

    # Step 2: Officer registers under Roads & Infrastructure department
    officer_email = f"road_officer_{uuid.uuid4().hex[:8]}@pwd.gov"
    auth_reg = register_endpoint(
        RegisterRequest(
            email=officer_email,
            password="OfficerPass123!",
            display_name="Engineer Kumar",
            role="authority",
            department="Roads & Infrastructure",
        )
    )
    officer_id = auth_reg["user"]["id"]
    assert auth_reg["user"]["account_status"] == "pending_approval"

    # Step 3: Admin approves officer
    approve_res = approve_authority_endpoint(officer_id, current_user=admin_user)
    assert approve_res["user"]["account_status"] == "active"
    approved_officer = get_user_by_email(officer_email)

    # Step 4: Officer logs in and checks dashboard statistics
    stats_all = get_statistics_summary_endpoint()
    assert stats_all["total_reports"] >= 1
    assert "Pending" in stats_all["status_counts"]

    # Check department-filtered statistics (Roads & Infrastructure -> Road Damage / Potholes)
    stats_roads = get_statistics_summary_endpoint(department="Roads & Infrastructure")
    assert stats_roads["filter_department"] == "Roads & Infrastructure"
    assert stats_roads["filter_category"] == "Road Damage / Potholes"
    assert stats_roads["status_counts"]["Pending"] >= 1

    # Step 5: Officer acknowledges the report
    ack_res = update_status_endpoint(
        report_id=report_id,
        payload=StatusUpdateRequest(
            status="Acknowledged",
            note="Road maintenance division received notification.",
        ),
        current_user=approved_officer,
    )
    assert ack_res["status"] == "Acknowledged"

    # Step 6: Officer marks In Progress
    prog_res = update_status_endpoint(
        report_id=report_id,
        payload=StatusUpdateRequest(
            status="In Progress",
            note="Road repair crew dispatched with asphalt mixer.",
        ),
        current_user=approved_officer,
    )
    assert prog_res["status"] == "In Progress"

    # Step 7: Officer attempts to resolve without evidence photo -> rejected
    with pytest.raises(HTTPException) as exc:
        update_status_endpoint(
            report_id=report_id,
            payload=StatusUpdateRequest(
                status="Resolved",
                note="Done fixing.",
            ),
            current_user=approved_officer,
        )
    assert exc.value.status_code == 400
    assert "resolution proof photo is strictly compulsory" in exc.value.detail

    # Step 8: Officer submits resolution evidence photo and completion remarks
    mock_repair_photo = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    upload_file = UploadFile(
        file=io.BytesIO(mock_repair_photo),
        filename="verified_repair_pothole.png",
        headers={"content-type": "image/png"},
    )

    resolved_rep = await submit_resolution_evidence_endpoint(
        report_id=report_id,
        image=upload_file,
        note="Pothole excavated, cold-mix asphalt laid and roller-compacted level with street surface.",
        current_user=approved_officer,
    )
    assert resolved_rep["status"] == "Resolved"
    assert resolved_rep["resolution_image_path"].startswith("/uploads/res_")
    assert "excavated" in resolved_rep["resolution_note"]
    assert resolved_rep["resolved_at"] is not None

    # Step 9: Verify public details endpoint includes full Before/After metadata and timeline
    public_detail = get_single_report(report_id)
    assert public_detail["status"] == "Resolved"
    assert public_detail["image_path"] == "/uploads/citizen_damaged_road.jpg"
    assert public_detail["resolution_image_path"] == resolved_rep["resolution_image_path"]
    assert len(public_detail["history"]) >= 4

    # Last history entry has evidence photo and note
    latest_history = public_detail["history"][-1]
    assert latest_history["new_status"] == "Resolved"
    assert latest_history["evidence_image_path"] == resolved_rep["resolution_image_path"]

    # Step 10: Verify statistics reflect the resolution turnaround
    stats_updated = get_statistics_summary_endpoint(department="Roads & Infrastructure")
    assert stats_updated["status_counts"]["Resolved"] >= 1
    assert stats_updated["average_resolution_hours"] is not None
    assert stats_updated["average_resolution_hours"] >= 0.0
