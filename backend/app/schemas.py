"""Request bodies, validated by Pydantic before any route code runs."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Lang = Literal["en", "hi"]
Mode = Literal["deaf", "blind", "speech", "general"]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=128)
    specialty: str = Field(default="", max_length=80)

    @field_validator("email")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.strip().lower()


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.strip().lower()


class ConsultationIn(BaseModel):
    patient_name: str = Field(min_length=1, max_length=80)
    patient_mode: Mode = "deaf"
    patient_lang: Lang = "hi"
    doctor_lang: Lang = "en"


class GlossIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    lang: Lang | None = None


class TranslateIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    source: Lang
    target: Lang


class Frame(BaseModel):
    p: list[list[float]] = Field(min_length=6, max_length=6)
    l: list[list[float]] | None = None
    r: list[list[float]] | None = None

    @field_validator("l", "r")
    @classmethod
    def hand_size(cls, v):
        if v is not None and len(v) != 21:
            raise ValueError("A hand needs 21 points")
        return v


class RecognizeIn(BaseModel):
    frames: list[Frame] = Field(min_length=1, max_length=240)
    top_k: int = Field(default=3, ge=1, le=10)


class TemplateIn(BaseModel):
    label: str = Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9\-]+$")
    frames: list[Frame] = Field(min_length=4, max_length=240)


class PrescriptionItemIn(BaseModel):
    medicine: str = Field(min_length=1, max_length=80)
    dose: str = Field(default="", max_length=40)
    morning: float = Field(default=0, ge=0, le=5)
    afternoon: float = Field(default=0, ge=0, le=5)
    night: float = Field(default=0, ge=0, le=5)
    food: Literal["before", "after", "any"] = "after"
    days: int = Field(default=1, ge=1, le=365)
    instructions: str = Field(default="", max_length=200)


class PrescriptionIn(BaseModel):
    patient_name: str = Field(min_length=1, max_length=80)
    diagnosis: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=500)
    lang: Lang = "hi"
    consultation_code: str | None = None
    items: list[PrescriptionItemIn] = Field(min_length=1, max_length=20)


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    lang: Lang = "hi"
