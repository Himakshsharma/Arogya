"""Prescriptions: structured, shareable by link, readable aloud in Hindi or English."""
from fastapi import APIRouter, Depends, HTTPException, status

from ..db import Database, now_iso
from ..deps import current_doctor, db_dep
from ..schemas import PrescriptionIn
from ..security import share_token
from ..services.consult import build_message, save_message
from ..services.prescription_text import full_text, item_gloss, item_text
from ..services.rooms import rooms

router = APIRouter(prefix="/api/prescriptions", tags=["prescriptions"])


def _render(db: Database, rx: dict) -> dict:
    items = db.all("SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id", (rx["id"],))
    doctor = db.one("SELECT name, specialty FROM doctors WHERE id = ?", (rx["doctor_id"],))
    out_items = []
    for it in items:
        out_items.append({
            **{k: it[k] for k in ("medicine", "dose", "morning", "afternoon", "night", "food", "days", "instructions")},
            "text": {"en": item_text(it, "en"), "hi": item_text(it, "hi")},
            "gloss": item_gloss(it),
        })
    return {
        "token": rx["token"],
        "patient_name": rx["patient_name"],
        "diagnosis": rx["diagnosis"],
        "notes": rx["notes"],
        "lang": rx["lang"],
        "created_at": rx["created_at"],
        "doctor": doctor,
        "items": out_items,
        "speech": {"en": full_text(rx, items, "en"), "hi": full_text(rx, items, "hi")},
    }


@router.post("", status_code=201)
async def create(body: PrescriptionIn, doctor: dict = Depends(current_doctor), db: Database = Depends(db_dep)):
    consultation = None
    if body.consultation_code:
        consultation = db.one("SELECT * FROM consultations WHERE code = ? AND doctor_id = ?",
                              (body.consultation_code.upper(), doctor["id"]))
        if not consultation:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Consultation not found")
    token = share_token()
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO prescriptions(token, doctor_id, consultation_id, patient_name, diagnosis, notes, lang, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (token, doctor["id"], consultation["id"] if consultation else None, body.patient_name.strip(),
             body.diagnosis.strip(), body.notes.strip(), body.lang, now_iso()))
        rx_id = cur.lastrowid
        for it in body.items:
            c.execute(
                "INSERT INTO prescription_items(prescription_id, medicine, dose, morning, afternoon, night, food, days, instructions) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (rx_id, it.medicine.strip(), it.dose.strip(), it.morning, it.afternoon, it.night, it.food, it.days,
                 it.instructions.strip()))
    rx = _render(db, db.one("SELECT * FROM prescriptions WHERE id = ?", (rx_id,)))

    if consultation:
        msg = build_message("doctor", {
            "kind": "prescription",
            "text": {"en": "Your prescription is ready.", "hi": "आपका पर्चा तैयार है।"},
            "gloss": [{"gloss": g, "kind": "sign"} for g in ("MEDICINE", "TAKE", "TIME")],
            "extra": {"token": token, "count": len(rx["items"])},
        })
        saved = save_message(db, consultation["id"], msg)
        await rooms.broadcast(consultation["code"], {"type": "message", "message": saved})
    return rx


@router.get("")
def mine(doctor: dict = Depends(current_doctor), db: Database = Depends(db_dep)):
    rows = db.all("SELECT * FROM prescriptions WHERE doctor_id = ? ORDER BY id DESC LIMIT 50", (doctor["id"],))
    return [{"token": r["token"], "patient_name": r["patient_name"], "diagnosis": r["diagnosis"],
             "created_at": r["created_at"]} for r in rows]


@router.get("/{token}")
def get_one(token: str, db: Database = Depends(db_dep)):
    """Public by link: the patient opens it on their own phone, no account needed."""
    rx = db.one("SELECT * FROM prescriptions WHERE token = ?", (token,))
    if not rx:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prescription not found. Check the link.")
    return _render(db, rx)
