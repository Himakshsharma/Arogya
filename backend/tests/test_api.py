"""End-to-end API tests through FastAPI's TestClient (HTTP + WebSocket)."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def doctor(client):
    r = client.post("/api/auth/login", json={"email": "demo@arogya.in", "password": "arogya123"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "token": token}


def auth(d):
    return {"Authorization": d["Authorization"]}


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert "translation_engine" in body["capabilities"]


def test_register_and_duplicate(client):
    payload = {"name": "Dr Test", "email": "Test@Example.com", "password": "secret1"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409
    assert client.post("/api/auth/login", json={"email": "test@example.com", "password": "nope"}).status_code == 401


def test_me_requires_token(client, doctor):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth(doctor)).json()["email"] == "demo@arogya.in"


def test_gloss_and_translate(client):
    assert client.post("/api/isl/gloss", json={"text": "Where does it hurt?"}).json()["gloss_text"] == "PAIN WHERE"
    r = client.post("/api/translate", json={"text": "Do you have a fever?", "source": "en", "target": "hi"}).json()
    assert r["text"] == "क्या आपको बुखार है?"


def test_catalogs(client):
    assert len(client.get("/api/symptoms").json()["symptoms"]) > 20
    assert client.get("/api/phrases").json()["doctor"]
    assert "PAIN" in client.get("/api/isl/lexicon").json()["signs"]


def _frames(y):
    frames = []
    for t in range(16):
        hand = [[-0.3, y + 0.01 * t, 0.1]] * 21
        frames.append({"p": [[0.5, 0, 0], [-0.5, 0, 0], [0.7, -0.6, 0], [-0.7, -0.6, 0], [0.6, -1.2, 0], hand[0]],
                       "r": hand})
    return frames


def test_templates_and_recognize(client):
    r = client.post("/api/signs/templates", json={"label": "water", "frames": _frames(0.4)})
    assert r.status_code == 201 and r.json()["label"] == "WATER"
    preds = client.post("/api/signs/recognize", json={"frames": _frames(0.42)}).json()["predictions"]
    assert preds and preds[0]["label"] == "WATER"
    tid = r.json()["id"]
    assert client.get("/api/signs/recorded/WATER").json()["id"] == tid
    assert client.delete(f"/api/signs/templates/{tid}").status_code == 204


def test_template_without_hands_rejected(client):
    frames = [{"p": [[0, 0, 0]] * 6} for _ in range(8)]
    assert client.post("/api/signs/templates", json={"label": "X", "frames": frames}).status_code == 422


def test_consultation_flow_over_websocket(client, doctor):
    c = client.post("/api/consultations", headers=auth(doctor),
                    json={"patient_name": "Asha", "patient_mode": "deaf", "patient_lang": "hi", "doctor_lang": "en"})
    assert c.status_code == 201
    code = c.json()["code"]
    assert client.get(f"/api/consultations/{code.lower()}").json()["patient_name"] == "Asha"

    with client.websocket_connect(f"/ws/consult/{code}?role=doctor&token={doctor['token']}") as doc_ws, \
            client.websocket_connect(f"/ws/consult/{code}?role=patient") as pat_ws:
        assert doc_ws.receive_json()["type"] == "history"
        assert pat_ws.receive_json()["type"] == "history"

        doc_ws.send_json({"kind": "say", "text": "Where does it hurt?", "lang": "en"})

        def next_message(ws, sender):
            # Each socket also receives its own messages and presence updates; skip those
            while True:
                m = ws.receive_json()
                if m["type"] == "message" and m["message"]["sender"] == sender:
                    return m["message"]

        got = next_message(pat_ws, "doctor")
        assert got["text"]["hi"] == "दर्द कहाँ हो रहा है?"
        assert [t["gloss"] for t in got["gloss"]] == ["PAIN", "WHERE"]

        pat_ws.send_json({"kind": "symptom", "id": "headache"})
        assert next_message(doc_ws, "patient")["text"]["en"] == "I have a headache."

        pat_ws.send_json({"kind": "pain", "level": 99})
        while True:
            m = pat_ws.receive_json()
            if m["type"] == "error":
                break

    history = client.get(f"/api/consultations/{code}/messages").json()
    assert len(history) == 2


def test_doctor_socket_needs_token(client, doctor):
    code = client.post("/api/consultations", headers=auth(doctor), json={"patient_name": "B"}).json()["code"]
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/consult/{code}?role=doctor") as ws:
            ws.receive_json()


def test_prescription_roundtrip(client, doctor):
    code = client.post("/api/consultations", headers=auth(doctor), json={"patient_name": "Ravi"}).json()["code"]
    body = {"patient_name": "Ravi", "diagnosis": "Viral fever", "lang": "hi", "consultation_code": code,
            "items": [{"medicine": "Paracetamol", "dose": "500 mg", "morning": 1, "night": 1, "food": "after", "days": 3}]}
    r = client.post("/api/prescriptions", headers=auth(doctor), json=body)
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    rx = client.get(f"/api/prescriptions/{token}").json()
    assert "सुबह 1 और रात 1" in rx["items"][0]["text"]["hi"]
    assert rx["speech"]["en"].startswith("Ravi, here are your medicines.")
    assert client.get("/api/prescriptions/doesnotexist").status_code == 404
    kinds = [m["kind"] for m in client.get(f"/api/consultations/{code}/messages").json()]
    assert "prescription" in kinds


def test_close_consultation(client, doctor):
    code = client.post("/api/consultations", headers=auth(doctor), json={"patient_name": "C"}).json()["code"]
    assert client.post(f"/api/consultations/{code}/close", headers=auth(doctor)).json()["status"] == "closed"


def test_speech_endpoints_report_disabled(client):
    assert client.post("/api/speech/tts", json={"text": "hello", "lang": "en"}).status_code in (200, 503)
