"""Loads the JSON data files once and keeps them in memory."""
import json
from functools import lru_cache

from ..config import DATA_DIR


def _load(name: str) -> dict:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def lexicon() -> dict:
    return _load("isl_lexicon.json")


@lru_cache(maxsize=None)
def phrases() -> dict:
    return _load("phrases.json")


@lru_cache(maxsize=None)
def symptoms() -> dict:
    return _load("symptoms.json")


def symptom_by_id(symptom_id: str) -> dict | None:
    for s in symptoms()["symptoms"]:
        if s["id"] == symptom_id:
            return s
    return None


def region_by_id(region_id: str) -> dict | None:
    for r in symptoms()["body_regions"]:
        if r["id"] == region_id:
            return r
    return None
