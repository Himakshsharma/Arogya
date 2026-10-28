"""Consultations: create a room, join it, talk over a WebSocket."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from ..db import Database, get_db, now_iso
from ..deps import current_doctor, db_dep, doctor_from_token
from ..schemas import ConsultationIn
from ..security import room_code
from ..services.consult import MessageError, build_message, load_messages, save_message
from ..services.rooms import rooms

router = APIRouter(tags=["consultations"])
log = logging.getLogger("arogya.consult")


def _get(db: Database, code: str) -> dict:
    row = db.one("SELECT * FROM consultations WHERE code = ?", (code.upper(),))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No consultation with this code")
    return row


def _public(c: dict, doctor_name: str | None = None) -> dict:
    out = {k: c[k] for k in ("code", "patient_name", "patient_mode", "patient_lang", "doctor_lang",
                             "status", "created_at", "closed_at")}
    if doctor_name:
        out["doctor_name"] = doctor_name
    return out


@router.post("/api/consultations", status_code=201)
def create(body: ConsultationIn, doctor: dict = Depends(current_doctor), db: Database = Depends(db_dep)):
    for _ in range(10):
        code = room_code()
        if not db.one("SELECT id FROM consultations WHERE code = ?", (code,)):
            break
    db.insert(
        "INSERT INTO consultations(code, doctor_id, patient_name, patient_mode, patient_lang, doctor_lang, "
        "status, created_at) VALUES (?,?,?,?,?,?, 'active', ?)",
        (code, doctor["id"], body.patient_name.strip(), body.patient_mode, body.patient_lang,
         body.doctor_lang, now_iso()),
    )
    return _public(_get(db, code), doctor["name"])


@router.get("/api/consultations")
def mine(doctor: dict = Depends(current_doctor), db: Database = Depends(db_dep)):
    rows = db.all(
        "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id) AS message_count "
        "FROM consultations c WHERE doctor_id = ? ORDER BY c.id DESC LIMIT 50", (doctor["id"],))
    return [{**_public(r), "message_count": r["message_count"]} for r in rows]


@router.get("/api/consultations/{code}")
def lookup(code: str, db: Database = Depends(db_dep)):
    """Public on purpose: the patient only knows the code shown on the doctor's screen."""
    c = _get(db, code)
    doctor = db.one("SELECT name FROM doctors WHERE id = ?", (c["doctor_id"],))
    return _public(c, doctor["name"] if doctor else None)


@router.get("/api/consultations/{code}/messages")
def history(code: str, db: Database = Depends(db_dep)):
    c = _get(db, code)
    return load_messages(db, c["id"])


@router.post("/api/consultations/{code}/close")
async def close(code: str, doctor: dict = Depends(current_doctor), db: Database = Depends(db_dep)):
    c = _get(db, code)
    if c["doctor_id"] != doctor["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the doctor who started this consultation can end it")
    db.execute("UPDATE consultations SET status = 'closed', closed_at = ? WHERE id = ?", (now_iso(), c["id"]))
    await rooms.broadcast(c["code"], {"type": "closed"})
    return _public(_get(db, code))


@router.websocket("/ws/consult/{code}")
async def consult_socket(ws: WebSocket, code: str, role: str = Query("patient"), token: str | None = Query(None)):
    db = get_db()
    code = code.upper()
    # accept first so the client actually receives our 44xx close codes
    await ws.accept()
    c = db.one("SELECT * FROM consultations WHERE code = ?", (code,))
    if not c or c["status"] != "active":
        await ws.close(code=4404, reason="Consultation not found or already ended")
        return
    if role == "doctor":
        doctor = doctor_from_token(token, db)
        if not doctor or doctor["id"] != c["doctor_id"]:
            await ws.close(code=4401, reason="Doctor sign-in required")
            return
    elif role != "patient":
        await ws.close(code=4400, reason="Unknown role")
        return

    await rooms.join(code, ws, role)
    await ws.send_json({"type": "history", "messages": load_messages(db, c["id"])})
    await rooms.broadcast(code, {"type": "presence", **rooms.presence(code)})

    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
                continue
            if data.get("type") == "typing":
                await rooms.broadcast(code, {"type": "typing", "sender": role})
                continue
            try:
                msg = build_message(role, data)
            except MessageError as e:
                await ws.send_json({"type": "error", "detail": str(e)})
                continue
            saved = save_message(db, c["id"], msg)
            await rooms.broadcast(code, {"type": "message", "message": saved})
    except WebSocketDisconnect:
        pass
    except Exception as e:  # malformed JSON etc. - drop this socket, keep the server alive
        log.warning("Socket error in %s: %s", code, e)
    finally:
        await rooms.leave(code, ws)
        await rooms.broadcast(code, {"type": "presence", **rooms.presence(code)})
