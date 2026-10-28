"""Builds and stores consultation messages (bilingual text + ISL gloss)."""
import json

from ..db import Database, dumps, now_iso
from .catalog import phrases, region_by_id, symptom_by_id
from .gloss import gloss_to_sentence, text_to_gloss
from .translator import translate

KINDS = {"say", "phrase", "symptom", "pain", "sign", "prescription", "system"}


class MessageError(ValueError):
    pass


def _both(text: str, lang: str) -> tuple[dict, dict]:
    other = "hi" if lang == "en" else "en"
    tr = translate(text, lang, other)
    return {lang: text, other: tr["text"]}, {"engine": tr["engine"], "approximate": tr["approximate"]}


def _find_phrase(phrase_id: str) -> dict | None:
    p = phrases()
    for entry in p["doctor"] + p["patient"]:
        if entry["id"] == phrase_id:
            return entry
    return None


def build_message(sender: str, data: dict) -> dict:
    kind = data.get("kind", "say")
    if kind not in KINDS:
        raise MessageError(f"Unknown message kind '{kind}'")

    msg = {"sender": sender, "kind": kind, "engine": "none", "approximate": False,
           "urgent": False, "extra": {}}

    if kind == "say":
        text = (data.get("text") or "").strip()[:500]
        if not text:
            raise MessageError("Message text is empty")
        lang = data.get("lang") if data.get("lang") in ("en", "hi") else "en"
        texts, meta = _both(text, lang)
        msg.update(text=texts, original_lang=lang, **meta)
        msg["gloss"] = text_to_gloss(text, lang)["tokens"]
        msg["is_question"] = text.rstrip().endswith("?")

    elif kind == "phrase":
        entry = _find_phrase(data.get("id", ""))
        if not entry:
            raise MessageError("Unknown phrase")
        msg.update(text={"en": entry["en"], "hi": entry["hi"]}, original_lang="en", engine="phrasebook")
        msg["gloss"] = text_to_gloss(entry["en"], "en")["tokens"]
        msg["is_question"] = entry["en"].endswith("?")
        msg["extra"] = {"phrase_id": entry["id"]}

    elif kind == "symptom":
        s = symptom_by_id(data.get("id", ""))
        if not s:
            raise MessageError("Unknown symptom")
        msg.update(text={"en": s["say_en"], "hi": s["say_hi"]}, original_lang="en", engine="phrasebook")
        msg["gloss"] = [{"gloss": g, "kind": "sign"} for g in s["gloss"]]
        msg["urgent"] = bool(s.get("urgent"))
        msg["extra"] = {"symptom_id": s["id"], "label": {"en": s["en"], "hi": s["hi"]}}

    elif kind == "pain":
        try:
            level = int(data.get("level"))
        except (TypeError, ValueError):
            raise MessageError("Pain level must be a number from 0 to 10")
        if not 0 <= level <= 10:
            raise MessageError("Pain level must be from 0 to 10")
        region = region_by_id(data.get("region", "")) if data.get("region") else None
        if region:
            en = f"Pain in my {region['en'].lower()}: {level} out of 10."
            hi = f"मेरे {region['hi']} में दर्द: 10 में से {level}।"
        else:
            en = f"My pain is {level} out of 10."
            hi = f"मेरा दर्द 10 में से {level} है।"
        msg.update(text={"en": en, "hi": hi}, original_lang="en", engine="template")
        msg["gloss"] = [{"gloss": "ME", "kind": "sign"}, {"gloss": "PAIN", "kind": "sign"}]
        msg["urgent"] = level >= 8
        msg["extra"] = {"level": level, "region": region["id"] if region else None}

    elif kind == "sign":
        glosses = [str(g).upper()[:24] for g in (data.get("glosses") or []) if str(g).strip()][:20]
        if not glosses:
            raise MessageError("No signs to send")
        msg.update(text={"en": gloss_to_sentence(glosses, "en"), "hi": gloss_to_sentence(glosses, "hi")},
                   original_lang="isl", engine="gloss", approximate=True)
        msg["gloss"] = [{"gloss": g, "kind": "sign"} for g in glosses]
        msg["extra"] = {"glosses": glosses}

    elif kind in ("prescription", "system"):
        text = data.get("text") or {}
        msg.update(text={"en": text.get("en", ""), "hi": text.get("hi", "")}, original_lang="en")
        msg["gloss"] = data.get("gloss", [])
        msg["extra"] = data.get("extra", {})

    return msg


def save_message(db: Database, consultation_id: int, msg: dict) -> dict:
    created = now_iso()
    payload = {k: v for k, v in msg.items() if k not in ("sender", "kind")}
    msg_id = db.insert(
        "INSERT INTO messages(consultation_id, sender, kind, payload, created_at) VALUES (?,?,?,?,?)",
        (consultation_id, msg["sender"], msg["kind"], dumps(payload), created),
    )
    return {"id": msg_id, "created_at": created, **msg}


def load_messages(db: Database, consultation_id: int, limit: int = 200) -> list[dict]:
    rows = db.all(
        "SELECT id, sender, kind, payload, created_at FROM messages WHERE consultation_id = ? "
        "ORDER BY id DESC LIMIT ?", (consultation_id, limit))
    out = []
    for r in reversed(rows):
        out.append({"id": r["id"], "sender": r["sender"], "kind": r["kind"],
                    "created_at": r["created_at"], **json.loads(r["payload"])})
    return out
