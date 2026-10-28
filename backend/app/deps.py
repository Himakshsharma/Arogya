"""Shared FastAPI dependencies."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import Database, get_db
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def db_dep() -> Database:
    return get_db()


def doctor_from_token(token: str | None, db: Database) -> dict | None:
    if not token:
        return None
    doctor_id = decode_token(token)
    if doctor_id is None:
        return None
    return db.one("SELECT id, name, email, specialty FROM doctors WHERE id = ?", (doctor_id,))


def current_doctor(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Database = Depends(db_dep),
) -> dict:
    doctor = doctor_from_token(creds.credentials if creds else None, db)
    if not doctor:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again to continue")
    return doctor
