"""Gloss, translation, phrasebook and symptom catalog."""
from fastapi import APIRouter

from pydantic import BaseModel, Field

from ..schemas import GlossIn, Lang, TranslateIn
from ..services.catalog import lexicon, phrases, symptoms
from ..services.gloss import gloss_to_sentence, text_to_gloss
from ..services.translator import translate

router = APIRouter(prefix="/api", tags=["language"])


@router.post("/isl/gloss")
def gloss(body: GlossIn):
    return text_to_gloss(body.text, body.lang)


class SentenceIn(BaseModel):
    glosses: list[str] = Field(min_length=1, max_length=30)
    lang: Lang = "en"


@router.post("/isl/sentence")
def sentence(body: SentenceIn):
    """Recognised signs -> a line of text in English or Hindi."""
    glosses = [g.upper() for g in body.glosses]
    return {"text": gloss_to_sentence(glosses, body.lang), "glosses": glosses}


@router.get("/isl/lexicon")
def get_lexicon():
    lex = lexicon()
    return {"signs": lex["signs"], "categories": lex["categories"]}


@router.post("/translate")
def do_translate(body: TranslateIn):
    return translate(body.text, body.source, body.target)


@router.get("/phrases")
def get_phrases():
    p = phrases()
    return {"doctor": p["doctor"], "patient": p["patient"]}


@router.get("/symptoms")
def get_symptoms():
    return symptoms()
