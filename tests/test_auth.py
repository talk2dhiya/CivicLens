"""
Automated unit and integration tests for CivicLens Authentication & Role Authorization (Phase 5).
Verifies registration, login, JWT token verification, role permissions (Citizen, Authority, Admin),
and administrator authority account approval workflow.
"""

import uuid
import pytest
from fastapi import HTTPException
from backend.main import (
    RegisterRequest,
    LoginRequest,
    StatusUpdateRequest,
    register_endpoint,
    login_endpoint,
    get_me_endpoint,
    list_authorities_endpoint,
    approve_authority_endpoint,
    reject_authority_endpoint,
    update_status_endpoint,
    get_current_user,
    require_approved_authority_or_admin,
    require_admin,
)
from backend.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    seed_initial_admin,
)
from backend.database import get_user_by_email, create_report


@pytest.fixture(scope="module", autouse=True)
def setup_admin():
    seed_initial_admin()


def test_password_hashing_and_verification():
    pw = "SecretPass123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

    with pytest.raises(ValueError, match="at least 6 characters"):
        hash_password("123")


def test_jwt_token_creation_and_decoding():
    payload = {"sub": "999", "email": "test@example.com", "role": "citizen"}
    token = create_access_token(payload)
    assert isinstance(token, str)

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "999"
    assert decoded["email"] == "test@example.com"
    assert decoded["role"] == "citizen"

    # Corrupted token
    assert decode_access_token("corrupted.jwt.token") is None


def test_citizen_registration_and_login():
    unique_email = f"citizen_{uuid.uuid4().hex[:8]}@example.com"

    # Register Citizen
    reg_req = RegisterRequest(
        email=unique_email,
        password="Password123!",
        display_name="Citizen Jane",
        role="citizen",
    )
    reg_res = register_endpoint(reg_req)
    assert reg_res["user"]["email"] == unique_email
    assert reg_res["user"]["role"] == "citizen"
    assert reg_res["user"]["account_status"] == "active"
    assert reg_res["access_token"] is not None

    # Login Citizen
    login_req = LoginRequest(email=unique_email, password="Password123!")
    login_res = login_endpoint(login_req)
    assert login_res["access_token"] is not None
    assert login_res["user"]["email"] == unique_email

    # Wrong password login
    with pytest.raises(HTTPException) as exc:
        login_endpoint(LoginRequest(email=unique_email, password="WrongPassword!"))
    assert exc.value.status_code == 401


def test_authority_registration_requires_admin_approval():
    unique_email = f"officer_{uuid.uuid4().hex[:8]}@civic.gov"

    # Register Authority
    reg_req = RegisterRequest(
        email=unique_email,
        password="AuthorityPass123!",
        display_name="Officer Ramesh",
        role="authority",
        department="Roads & Infrastructure",
    )
    reg_res = register_endpoint(reg_req)
    assert reg_res["user"]["account_status"] == "pending_approval"
    assert reg_res["access_token"] is None  # Token not granted until approved
    auth_user_id = reg_res["user"]["id"]

    # Pending authority attempts to login: receives token but account_status is 'pending_approval'
    login_res = login_endpoint(LoginRequest(email=unique_email, password="AuthorityPass123!"))
    auth_token = login_res["access_token"]
    officer_user = get_current_user(f"Bearer {auth_token}")

    # Pending authority attempts to update a report status: must be blocked with 403 Forbidden
    with pytest.raises(HTTPException) as exc:
        require_approved_authority_or_admin(officer_user)
    assert exc.value.status_code == 403
    assert "pending administrator approval" in exc.value.detail

    # Administrator approves the authority
    admin_user = get_user_by_email("admin@civiclens.local")
    approve_res = approve_authority_endpoint(auth_user_id, current_user=admin_user)
    assert approve_res["user"]["account_status"] == "active"

    # Now approved officer can pass authority guard
    approved_officer = get_current_user(f"Bearer {auth_token}")
    guarded_officer = require_approved_authority_or_admin(approved_officer)
    assert guarded_officer["id"] == auth_user_id


def test_admin_role_enforcement():
    # Citizen cannot access admin endpoints
    unique_email = f"citizen_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = register_endpoint(
        RegisterRequest(
            email=unique_email,
            password="Password123!",
            display_name="Regular Citizen",
            role="citizen",
        )
    )
    citizen_user = get_user_by_email(unique_email)

    with pytest.raises(HTTPException) as exc:
        require_admin(citizen_user)
    assert exc.value.status_code == 403
    assert "Administrator access required" in exc.value.detail

    # Admin passes guard
    admin_user = get_user_by_email("admin@civiclens.local")
    assert require_admin(admin_user)["role"] == "admin"


def test_citizen_report_submission_and_my_reports():
    from backend.main import get_my_reports_endpoint

    unique_email = f"reporter_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = register_endpoint(
        RegisterRequest(
            email=unique_email,
            password="Password123!",
            display_name="Civic Citizen",
            role="citizen",
        )
    )
    user = reg_res["user"]

    # Insert a report directly linked to user_id
    rep = create_report(
        category="Road Damage / Potholes",
        description="Large pothole near school entrance",
        location_text="12th Main Road, Ward 4",
        latitude=12.9716,
        longitude=77.5946,
        image_path="/uploads/mock_pothole.jpg",
        user_id=user["id"],
    )

    # Call /reports/my
    my_reports_res = get_my_reports_endpoint(current_user=user)
    assert len(my_reports_res["reports"]) >= 1
    assert any(r["id"] == rep["id"] for r in my_reports_res["reports"])


def test_status_transition_access_control():
    # 1. Create a report
    rep = create_report(
        category="Water Leakage",
        description="Broken pipeline spurting water",
        location_text="Park Street Corner",
        latitude=12.9750,
        longitude=77.5900,
        image_path="/uploads/leak.jpg",
    )

    # 2. Citizen tries to update status: blocked with 403
    unique_email = f"citizen_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = register_endpoint(
        RegisterRequest(
            email=unique_email,
            password="Password123!",
            display_name="Ordinary Resident",
            role="citizen",
        )
    )
    with pytest.raises(HTTPException) as exc:
        require_approved_authority_or_admin(reg_res["user"])
    assert exc.value.status_code == 403

    # 3. Approved authority updates status: succeeds
    officer_email = f"officer_{uuid.uuid4().hex[:8]}@dept.gov"
    auth_reg = register_endpoint(
        RegisterRequest(
            email=officer_email,
            password="OfficerPass123!",
            display_name="Inspector Dave",
            role="authority",
            department="Water Supply & Sewerage",
        )
    )
    admin_user = get_user_by_email("admin@civiclens.local")
    approve_authority_endpoint(auth_reg["user"]["id"], current_user=admin_user)
    approved_officer = get_user_by_email(officer_email)

    status_req = StatusUpdateRequest(status="Acknowledged", note="Dispatched water repair squad")
    res = update_status_endpoint(
        report_id=rep["id"],
        payload=status_req,
        current_user=approved_officer,
    )
    assert res["status"] == "Acknowledged"
    assert len(res["history"]) >= 2
    assert res["history"][-1]["new_status"] == "Acknowledged"
    assert res["history"][-1]["note"] == "Dispatched water repair squad"
