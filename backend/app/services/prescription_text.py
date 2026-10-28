"""Spoken-text and gloss generation for structured prescriptions."""

FOOD_EN = {"before": "before food", "after": "after food", "any": ""}
FOOD_HI = {"before": "खाने से पहले", "after": "खाने के बाद", "any": ""}
SLOT_EN = {"morning": "in the morning", "afternoon": "in the afternoon", "night": "at night"}
SLOT_HI = {"morning": "सुबह", "afternoon": "दोपहर", "night": "रात"}
SLOT_GLOSS = {"morning": "MORNING", "afternoon": "AFTERNOON", "night": "NIGHT"}
NUM_GLOSS = {1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE"}


def _qty_en(q: float) -> str:
    if q == 0.5:
        return "half"
    return str(int(q)) if float(q).is_integer() else str(q)


def _qty_hi(q: float) -> str:
    if q == 0.5:
        return "आधी"
    return str(int(q)) if float(q).is_integer() else str(q)


def _slots(item: dict) -> list[tuple[str, float]]:
    return [(s, float(item.get(s) or 0)) for s in ("morning", "afternoon", "night") if float(item.get(s) or 0) > 0]


def _join_en(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def item_text(item: dict, lang: str) -> str:
    med = item["medicine"].strip()
    dose = (item.get("dose") or "").strip()
    head = f"{med}, {dose}." if dose else f"{med}."
    slots = _slots(item)
    days = int(item.get("days") or 1)
    extra = (item.get("instructions") or "").strip()

    if lang == "hi":
        when = " और ".join(f"{SLOT_HI[s]} {_qty_hi(q)}" for s, q in slots) or "डॉक्टर के बताए अनुसार"
        food = FOOD_HI.get(item.get("food", "after"), "")
        parts = [when, food, f"{days} दिन तक लीजिए।"]
        line = f"{head} " + ", ".join(p for p in parts[:-1] if p) + ", " + parts[-1]
    else:
        when = _join_en([f"{_qty_en(q)} {SLOT_EN[s]}" for s, q in slots]) or "as advised by the doctor"
        food = FOOD_EN.get(item.get("food", "after"), "")
        day_word = "day" if days == 1 else "days"
        line = f"{head} Take {when}" + (f", {food}" if food else "") + f", for {days} {day_word}."
    if extra:
        line += f" {extra}"
    return line


def item_gloss(item: dict) -> list[str]:
    gloss = ["MEDICINE"]
    for slot, q in _slots(item):
        gloss.append(SLOT_GLOSS[slot])
        if float(q).is_integer() and int(q) in NUM_GLOSS:
            gloss.append(NUM_GLOSS[int(q)])
    food = item.get("food", "after")
    if food in ("before", "after"):
        gloss += ["FOOD", food.upper()]
    days = int(item.get("days") or 1)
    gloss += [NUM_GLOSS.get(days, str(days)), "DAY", "TAKE"]
    return gloss


def full_text(rx: dict, items: list[dict], lang: str) -> str:
    name = rx.get("patient_name", "")
    if lang == "hi":
        intro = f"{name} जी, आपकी दवाइयाँ इस प्रकार हैं।" if name else "आपकी दवाइयाँ इस प्रकार हैं।"
        outro = "दवा समय पर लीजिए। कोई परेशानी हो तो डॉक्टर से मिलिए।"
    else:
        intro = f"{name}, here are your medicines." if name else "Here are your medicines."
        outro = "Take your medicines on time. If you feel worse, see the doctor."
    body = " ".join(f"{i + 1}. {item_text(it, lang)}" for i, it in enumerate(items))
    notes = (rx.get("notes") or "").strip()
    return " ".join(p for p in (intro, body, notes, outro) if p)
