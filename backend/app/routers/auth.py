from fastapi import APIRouter, Depends, HTTPException, status

from ..db import Database, now_iso
from ..deps import current_doctor, db_dep
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _public(doc: dict) -> dict:
    return {"id": doc["id"], "name": doc["name"], "email": doc["email"], "specialty": doc.get("specialty", "")}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Database = Depends(db_dep)):
    if db.one("SELECT id FROM doctors WHERE email = ?", (body.email,)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    doc_id = db.insert(
        "INSERT INTO doctors(name, email, password_hash, specialty, created_at) VALUES (?,?,?,?,?)",
        (body.name.strip(), body.email, hash_password(body.password), body.specialty.strip(), now_iso()),
    )
    doctor = db.one("SELECT * FROM doctors WHERE id = ?", (doc_id,))
    return {"token": create_token(doc_id), "doctor": _public(doctor)}


@router.post("/login")
def login(body: LoginIn, db: Database = Depends(db_dep)):
    doctor = db.one("SELECT * FROM doctors WHERE email = ?", (body.email,))
    if not doctor or not verify_password(body.password, doctor["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")
    return {"token": create_token(doctor["id"]), "doctor": _public(doctor)}


@router.get("/me")
def me(doctor: dict = Depends(current_doctor)):
    return _public(doctor)
