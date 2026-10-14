"""
Authentication service for CivicLens.
Provides bcrypt password hashing, JWT token creation and verification,
and auto-seeding of the initial platform administrator account.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import bcrypt
import jwt

from backend.database import create_user, get_user_by_email

# Configurable JWT parameters
JWT_SECRET_KEY = os.environ.get(
    "CIVICLENS_JWT_SECRET", "civiclens-dev-insecure-secret-key-change-in-production-123456"
)
JWT_ALGORITHM = "HS256"
DEFAULT_TOKEN_EXPIRY_HOURS = 24

# Configurable initial admin seed credentials
DEFAULT_ADMIN_EMAIL = os.environ.get("CIVICLENS_ADMIN_EMAIL", "admin@civiclens.local")
DEFAULT_ADMIN_PASSWORD = os.environ.get("CIVICLENS_ADMIN_PASSWORD", "Admin123!")
DEFAULT_ADMIN_NAME = "System Administrator"


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt."""
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_access_token(
    user_payload: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """Generate a signed JWT access token for a user session."""
    to_encode = user_payload.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=DEFAULT_TOKEN_EXPIRY_HOURS)

    to_encode.update({"iat": now, "exp": expire})
    token = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token. Returns payload dict or None if invalid/expired."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None


DEFAULT_CITIZEN_EMAIL = os.environ.get("CIVICLENS_CITIZEN_EMAIL", "citizen@civiclens.local")
DEFAULT_CITIZEN_PASSWORD = os.environ.get("CIVICLENS_CITIZEN_PASSWORD", "Citizen123!")
DEFAULT_CITIZEN_NAME = "Demo Citizen"


def seed_initial_admin() -> Optional[Dict[str, Any]]:
    """Ensure an initial platform administrator and demo citizen account exist on system startup."""
    # Seed Admin
    existing_admin = get_user_by_email(DEFAULT_ADMIN_EMAIL)
    if not existing_admin:
        hashed_pw = hash_password(DEFAULT_ADMIN_PASSWORD)
        create_user(
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hashed_pw,
            display_name=DEFAULT_ADMIN_NAME,
            role="admin",
            account_status="active",
        )

    # Seed Demo Citizen
    existing_citizen = get_user_by_email(DEFAULT_CITIZEN_EMAIL)
    if not existing_citizen:
        hashed_cit_pw = hash_password(DEFAULT_CITIZEN_PASSWORD)
        create_user(
            email=DEFAULT_CITIZEN_EMAIL,
            password_hash=hashed_cit_pw,
            display_name=DEFAULT_CITIZEN_NAME,
            role="citizen",
            account_status="active",
        )

    return get_user_by_email(DEFAULT_ADMIN_EMAIL)
