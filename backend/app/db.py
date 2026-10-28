"""SQLite schema and a small query helper."""
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    specialty TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    patient_name TEXT NOT NULL,
    patient_mode TEXT NOT NULL,          -- deaf | blind | speech | general
    patient_lang TEXT NOT NULL,          -- en | hi
    doctor_lang TEXT NOT NULL,           -- en | hi
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,                -- doctor | patient | system
    kind TEXT NOT NULL,                  -- say | symptom | pain | sign | prescription
    payload TEXT NOT NULL,               -- JSON
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    consultation_id INTEGER REFERENCES consultations(id),
    patient_name TEXT NOT NULL,
    diagnosis TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'hi',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine TEXT NOT NULL,
    dose TEXT DEFAULT '',
    morning INTEGER NOT NULL DEFAULT 0,
    afternoon INTEGER NOT NULL DEFAULT 0,
    night INTEGER NOT NULL DEFAULT 0,
    food TEXT NOT NULL DEFAULT 'after',  -- before | after | any
    days INTEGER NOT NULL DEFAULT 1,
    instructions TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sign_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    frames TEXT NOT NULL,                -- JSON list of normalized frames
    source TEXT NOT NULL DEFAULT 'user', -- user | starter
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_consultation ON messages(consultation_id);
CREATE INDEX IF NOT EXISTS idx_templates_label ON sign_templates(label);
"""

_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class Database:
    """Tiny wrapper so routers never write connection boilerplate."""

    def __init__(self, path: str | None = None):
        self.path = path or settings.db_path
        self.conn = connect(self.path)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    @contextmanager
    def tx(self):
        with _lock:
            try:
                yield self.conn
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise

    def one(self, sql: str, params: tuple = ()) -> dict | None:
        with _lock:
            row = self.conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def all(self, sql: str, params: tuple = ()) -> list[dict]:
        with _lock:
            rows = self.conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def insert(self, sql: str, params: tuple = ()) -> int:
        with self.tx() as c:
            cur = c.execute(sql, params)
            return cur.lastrowid

    def execute(self, sql: str, params: tuple = ()) -> int:
        with self.tx() as c:
            return c.execute(sql, params).rowcount


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


_db: Database | None = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = Database()
    return _db


def set_db(db: Database) -> None:
    """Used by tests to swap in a temporary database."""
    global _db
    _db = db
