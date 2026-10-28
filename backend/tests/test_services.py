import math

import numpy as np
import pytest

from app.security import create_token, decode_token, hash_password, room_code, verify_password
from app.services import features as F
from app.services.consult import MessageError, build_message, load_messages, save_message
from app.services.prescription_text import full_text, item_gloss, item_text
from app.services.translator import translate


# ---------- security ----------

def test_password_hash_roundtrip():
    h = hash_password("secret123")
    assert verify_password("secret123", h)
    assert not verify_password("wrong", h)
    assert not verify_password("x", "garbage")


def test_token_roundtrip():
    assert decode_token(create_token(42)) == 42
    assert decode_token("not-a-token") is None


def test_room_code_alphabet():
    code = room_code()
    assert len(code) == 6 and not set(code) & set("01OIL")


# ---------- translation ----------

def test_phrasebook_exact_both_ways():
    r = translate("Where does it hurt?", "en", "hi")
    assert r == {"text": "दर्द कहाँ हो रहा है?", "engine": "phrasebook", "approximate": False}
    assert translate("दर्द कहाँ हो रहा है?", "hi", "en")["text"] == "Where does it hurt?"


def test_phrasebook_ignores_case_and_punctuation():
    assert translate("where does it hurt", "en", "hi")["engine"] == "phrasebook"


def test_fallback_is_marked_approximate():
    r = translate("Drink water in the morning", "en", "hi")
    assert r["approximate"] is True
    assert "पानी" in r["text"] and "सुबह" in r["text"]


# ---------- features ----------

def _pose(cx=0.5, cy=0.5, sw=0.2):
    pose = [[cx, cy, 0.0] for _ in range(33)]
    pose[11] = [cx + sw / 2, cy, 0.0]     # left shoulder appears on image right
    pose[12] = [cx - sw / 2, cy, 0.0]
    pose[13] = [cx + sw * 0.7, cy + sw * 0.75, 0.0]
    pose[14] = [cx - sw * 0.7, cy + sw * 0.75, 0.0]
    pose[15] = [cx + sw * 0.6, cy + sw * 1.5, 0.0]
    pose[16] = [cx - sw * 0.3, cy + sw * 0.25, 0.0]
    return pose


def test_normalize_is_scale_and_position_invariant():
    a = F.normalize_raw(_pose(0.5, 0.5, 0.2), None, None, 640, 480)
    b = F.normalize_raw(_pose(0.3, 0.6, 0.1), None, None, 640, 480)
    assert np.allclose(a["p"], b["p"], atol=0.02)
    # shoulders at +-0.5, signer's right shoulder on the viewer's left
    assert math.isclose(a["p"][0][0], 0.5, abs_tol=1e-3)
    assert math.isclose(a["p"][1][0], -0.5, abs_tol=1e-3)


def test_assign_hands_by_wrist_distance():
    pose = _pose()
    near_left = [[pose[15][0], pose[15][1], 0]] * 21
    near_right = [[pose[16][0], pose[16][1], 0]] * 21
    left, right = F.assign_hands(pose, [near_right, near_left])
    assert left is near_left and right is near_right


def test_vectors_have_expected_size():
    frame = F.normalize_raw(_pose(), None, [[0.4, 0.5, 0]] * 21, 640, 480)
    assert F.frame_vector(frame).shape == (F.FEATURE_DIM,)
    assert F.compact_vector(frame).shape == (38,)
    assert F.sequence_for_model([frame] * 7).shape == (F.SEQ_LEN, F.FEATURE_DIM)


def test_resample_keeps_endpoints():
    seq = np.arange(10, dtype=np.float32)[:, None]
    out = F.resample(seq, 4)
    assert out[0, 0] == 0 and out[-1, 0] == 9


def test_dtw_tolerates_speed_change():
    t = np.linspace(0, 1, 24)
    a = np.stack([np.sin(t * 6), np.cos(t * 6)], axis=1)
    slow = F.resample(np.stack([np.sin(np.linspace(0, 1, 40) ** 1.3 * 6),
                                np.cos(np.linspace(0, 1, 40) ** 1.3 * 6)], axis=1), 24)
    other = np.stack([np.cos(t * 3), np.sin(t * 9)], axis=1)
    assert F.dtw_distance(a, slow) < F.dtw_distance(a, other)


def test_mirror_twice_is_identity():
    frame = F.normalize_raw(_pose(), [[0.6, 0.7, 0]] * 21, None, 640, 480)
    back = F.mirror_frame(F.mirror_frame(frame))
    assert np.allclose(F.frame_vector(back), F.frame_vector(frame))


# ---------- consultation messages ----------

def test_say_message_is_bilingual_with_gloss():
    m = build_message("doctor", {"kind": "say", "text": "Where does it hurt?", "lang": "en"})
    assert m["text"]["hi"] == "दर्द कहाँ हो रहा है?"
    assert [t["gloss"] for t in m["gloss"]] == ["PAIN", "WHERE"]
    assert m["is_question"]


def test_symptom_urgent_flag():
    m = build_message("patient", {"kind": "symptom", "id": "chest_pain"})
    assert m["urgent"] and m["text"]["hi"]


def test_pain_validation():
    m = build_message("patient", {"kind": "pain", "level": 9, "region": "chest"})
    assert m["urgent"] and "9 out of 10" in m["text"]["en"]
    with pytest.raises(MessageError):
        build_message("patient", {"kind": "pain", "level": 14})
    with pytest.raises(MessageError):
        build_message("patient", {"kind": "say", "text": "  "})


def test_sign_message():
    m = build_message("patient", {"kind": "sign", "glosses": ["me", "head", "pain"]})
    assert m["text"]["en"] == "I head pain" and m["approximate"]


def test_messages_persist(db):
    db.insert("INSERT INTO doctors(name,email,password_hash,created_at) VALUES ('d','d@x.in','h','t')")
    cid = db.insert("INSERT INTO consultations(code,doctor_id,patient_name,patient_mode,patient_lang,doctor_lang,created_at) "
                    "VALUES ('ABC234',1,'P','deaf','hi','en','t')")
    save_message(db, cid, build_message("patient", {"kind": "symptom", "id": "fever"}))
    msgs = load_messages(db, cid)
    assert len(msgs) == 1 and msgs[0]["extra"]["symptom_id"] == "fever"


# ---------- prescriptions ----------

ITEM = {"medicine": "Paracetamol", "dose": "500 mg", "morning": 1, "afternoon": 0, "night": 1,
        "food": "after", "days": 3, "instructions": ""}


def test_prescription_text_english():
    assert item_text(ITEM, "en") == "Paracetamol, 500 mg. Take 1 in the morning and 1 at night, after food, for 3 days."


def test_prescription_text_hindi():
    assert item_text(ITEM, "hi") == "Paracetamol, 500 mg. सुबह 1 और रात 1, खाने के बाद, 3 दिन तक लीजिए।"


def test_prescription_half_tablet_and_gloss():
    half = {**ITEM, "morning": 0.5, "night": 0, "days": 1, "food": "any"}
    assert "half in the morning" in item_text(half, "en") and "for 1 day." in item_text(half, "en")
    assert item_gloss(ITEM) == ["MEDICINE", "MORNING", "ONE", "NIGHT", "ONE", "FOOD", "AFTER", "THREE", "DAY", "TAKE"]


def test_full_text_mentions_patient():
    assert full_text({"patient_name": "Asha"}, [ITEM], "hi").startswith("Asha जी")


# ---------- recognition ----------

def test_template_matcher_finds_the_right_sign(db):
    from app.db import dumps, now_iso
    from app.services.recognizer import SignRecognizer

    def frames_for(hand_y, curl):
        out = []
        for t in range(20):
            hand = [[-0.3 + 0.01 * t, hand_y + 0.02 * k * curl, 0.2] for k in range(21)]
            p = [[0.5, 0, 0], [-0.5, 0, 0], [0.7, -0.6, 0], [-0.7, -0.6, 0], [0.6, -1.2, 0], hand[0]]
            out.append({"p": p, "l": None, "r": hand})
        return out

    for label, y, curl in (("HEAD", 0.7, 0.2), ("STOMACH", -0.6, 1.0), ("CHEST", -0.1, 0.5)):
        db.insert("INSERT INTO sign_templates(label, frames, source, created_at) VALUES (?,?,?,?)",
                  (label, dumps(frames_for(y, curl)), "user", now_iso()))
    rec = SignRecognizer(db)
    result = rec.recognize(frames_for(0.66, 0.25))
    assert result["predictions"][0]["label"] == "HEAD"
    assert rec.recognize([{"p": [[0, 0, 0]] * 6, "l": None, "r": None}] * 10)["reason"] == "no_hands"
