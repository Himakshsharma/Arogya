"""Sign recognition and the user's own recorded sign templates."""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import Database, dumps, now_iso
from ..deps import db_dep
from ..schemas import RecognizeIn, TemplateIn
from ..services.recognizer import get_recognizer

router = APIRouter(prefix="/api/signs", tags=["signs"])


def _frames(items) -> list[dict]:
    return [f.model_dump() for f in items]


@router.post("/recognize")
def recognize(body: RecognizeIn, db: Database = Depends(db_dep)):
    return get_recognizer(db).recognize(_frames(body.frames), body.top_k)


@router.get("/templates")
def list_templates(include_starter: bool = Query(False), db: Database = Depends(db_dep)):
    sql = "SELECT id, label, source, created_at, frames FROM sign_templates"
    if not include_starter:
        sql += " WHERE source = 'user'"
    rows = db.all(sql + " ORDER BY id DESC")
    return [{"id": r["id"], "label": r["label"], "source": r["source"], "created_at": r["created_at"],
             "frame_count": len(json.loads(r["frames"]))} for r in rows]


@router.get("/templates/{template_id}")
def get_template(template_id: int, db: Database = Depends(db_dep)):
    row = db.one("SELECT * FROM sign_templates WHERE id = ?", (template_id,))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sign not found")
    return {"id": row["id"], "label": row["label"], "source": row["source"], "frames": json.loads(row["frames"])}


@router.get("/recorded/{label}")
def recorded_for_label(label: str, db: Database = Depends(db_dep)):
    """Latest real recording of a sign, used by the avatar instead of its built-in animation."""
    row = db.one("SELECT id, frames FROM sign_templates WHERE label = ? AND source = 'user' "
                 "ORDER BY id DESC LIMIT 1", (label.upper(),))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No recording for this sign")
    return {"id": row["id"], "label": label.upper(), "frames": json.loads(row["frames"])}


@router.post("/templates", status_code=201)
def add_template(body: TemplateIn, db: Database = Depends(db_dep)):
    frames = _frames(body.frames)
    if not any(f.get("l") or f.get("r") for f in frames):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "No hands were visible in this recording. Keep both hands in view and try again.")
    tid = db.insert("INSERT INTO sign_templates(label, frames, source, created_at) VALUES (?,?, 'user', ?)",
                    (body.label.upper(), dumps(frames), now_iso()))
    get_recognizer(db).templates.invalidate()
    return {"id": tid, "label": body.label.upper()}


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: int, db: Database = Depends(db_dep)):
    if not db.execute("DELETE FROM sign_templates WHERE id = ? AND source = 'user'", (template_id,)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sign not found")
    get_recognizer(db).templates.invalidate()
