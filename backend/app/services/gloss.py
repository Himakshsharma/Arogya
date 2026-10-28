"""English/Hindi text -> ISL gloss.

Rules: drop function words, map words to signs, then order as
TIME, subject/object, VERB, NEGATION, QUESTION. Unknown words are fingerspelled.
"""
import re
import unicodedata

from .catalog import lexicon

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
TOKEN_RE = re.compile(r"[ऀ-ॿ]+|[a-zA-Z]+(?:'[a-zA-Z]+)?|\d+")

NUMBER_SIGNS = {"1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE"}

# Devanagari -> Latin, used to fingerspell Hindi names such as "रवि" -> "RAVI"
_CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
    "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d",
    "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r",
    "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "क़": "q", "ख़": "kh", "ग़": "g",
    "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f",
}
_VOWELS = {"अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e",
           "ऐ": "ai", "ओ": "o", "औ": "au"}
_MATRAS = {"ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai",
           "ो": "o", "ौ": "au"}
_SIGNS = {"ं": "n", "ँ": "n", "ः": "h"}
_VIRAMA = "्"
_NUKTA = "़"


def transliterate(word: str) -> str:
    """Simple Devanagari -> Latin with word-final schwa deletion."""
    word = unicodedata.normalize("NFC", word)
    out = []
    i = 0
    chars = list(word)
    while i < len(chars):
        ch = chars[i]
        nxt = chars[i + 1] if i + 1 < len(chars) else ""
        if nxt == _NUKTA:
            ch = ch + _NUKTA
            i += 1
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
        if ch in _CONS:
            out.append(_CONS[ch])
            if nxt in _MATRAS:
                out.append(_MATRAS[nxt])
                i += 1
            elif nxt == _VIRAMA:
                i += 1
            elif i + 1 < len(chars) and nxt not in _SIGNS:
                out.append("a")  # inherent vowel, dropped at the end of the word
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
        elif ch in _SIGNS:
            out.append(_SIGNS[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        i += 1
    return "".join(out)


def _lemmas(word: str) -> list[str]:
    """Cheap English lemmatizer: try the word, then common suffixes removed."""
    cands = [word]
    if word.endswith("'s"):
        cands.append(word[:-2])
    for suf, rep in (("ies", "y"), ("ing", ""), ("ing", "e"), ("ed", ""), ("ed", "e"), ("es", ""), ("s", "")):
        if word.endswith(suf) and len(word) > len(suf) + 2:
            cands.append(word[: -len(suf)] + rep)
    return cands


def _tokenize(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text).replace("’", "'").replace("‘", "'")
    return [t.lower() for t in TOKEN_RE.findall(text)]


def _match_phrases(tokens: list[str], phrases: dict) -> list:
    """Greedy longest-match of multi-word phrases. Returns tokens or ('PHRASE', glosses)."""
    table = {tuple(_tokenize(k)): v for k, v in phrases.items()}
    max_len = max((len(k) for k in table), default=1)
    out, i = [], 0
    while i < len(tokens):
        for n in range(min(max_len, len(tokens) - i), 1, -1):
            key = tuple(tokens[i:i + n])
            if key in table:
                out.append(("PHRASE", table[key]))
                i += n
                break
        else:
            out.append(tokens[i])
            i += 1
    return out


def detect_lang(text: str) -> str:
    return "hi" if DEVANAGARI.search(text or "") else "en"


def text_to_gloss(text: str, lang: str | None = None) -> dict:
    lex = lexicon()
    lang = lang or detect_lang(text)
    if detect_lang(text) == "hi":
        lang = "hi"
    signs = set(lex["signs"])
    cats = lex["categories"]
    time_w, verb_w = set(cats["time"]), set(cats["verb"])
    neg_w, wh_w = set(cats["negation"]), set(cats["question"])

    synonyms = lex["hi_synonyms"] if lang == "hi" else lex["en_synonyms"]
    drop = set(lex["hi_drop"] if lang == "hi" else lex["en_drop"])
    phrase_table = lex["hi_phrases"] if lang == "hi" else lex["en_phrases"]

    stripped = (text or "").strip()
    is_question = stripped.endswith("?") or stripped.endswith("？")

    raw = _tokenize(text or "")
    items = _match_phrases(raw, phrase_table)

    tokens: list[dict] = []
    for item in items:
        if isinstance(item, tuple):
            tokens.extend({"gloss": g, "kind": "sign", "source": "phrase"} for g in item[1])
            continue
        word = item
        if word.isdigit():
            if word in NUMBER_SIGNS:
                tokens.append({"gloss": NUMBER_SIGNS[word], "kind": "sign", "source": "number"})
            else:
                tokens.append({"gloss": word, "kind": "spell", "letters": word, "source": "number"})
            continue
        if word in drop:
            continue
        mapped = None
        for cand in (_lemmas(word) if lang == "en" else [word]):
            if cand in synonyms:
                mapped = synonyms[cand]
                break
            if cand.upper() in signs:
                mapped = cand.upper()
                break
        if mapped is None:
            letters = transliterate(word) if DEVANAGARI.search(word) else word
            letters = re.sub(r"[^a-zA-Z0-9]", "", letters).upper()
            if letters:
                tokens.append({"gloss": letters, "kind": "spell", "letters": letters, "source": "fingerspell"})
            continue
        for g in (mapped if isinstance(mapped, list) else [mapped]):
            tokens.append({"gloss": g, "kind": "sign", "source": "word"})

    # Reorder into ISL grammar: TIME + rest + VERB + NEG + WH
    def group(tok):
        g = tok["gloss"]
        if tok["kind"] != "sign":
            return 1
        if g in time_w:
            return 0
        if g in verb_w:
            return 2
        if g in neg_w:
            return 3
        if g in wh_w:
            return 4
        return 1

    ordered = sorted(tokens, key=group)  # sorted() is stable, keeps order inside a group

    # Collapse immediate repeats ("PAIN PAIN")
    final = []
    for tok in ordered:
        if final and final[-1]["gloss"] == tok["gloss"]:
            continue
        final.append(tok)

    if any(t["gloss"] in wh_w for t in final):
        is_question = True

    return {
        "input": text,
        "lang": lang,
        "tokens": final,
        "gloss_text": " ".join(t["gloss"] for t in final),
        "is_question": is_question,
    }


def gloss_to_sentence(glosses: list[str], lang: str = "en") -> str:
    """Recognised signs -> readable text, keeping sign order."""
    if not glosses:
        return ""
    if lang == "hi":
        from .catalog import phrases
        words_hi = phrases()["words"]
        extra = {"THANK-YOU": "धन्यवाद", "LIE-DOWN": "लेट जाइए", "UNDERSTAND": "समझ", "SLEEP": "नींद",
                 "SLOW": "धीरे", "AGAIN": "फिर से", "HAVE": "है", "FEEL": "महसूस", "OK": "ठीक है"}
        return " ".join(extra.get(g) or words_hi.get(g.lower(), g.lower()) for g in glosses)
    readable = {"ME": "I", "THANK-YOU": "thank you", "LIE-DOWN": "lie down"}
    words = [readable.get(g, g.lower().replace("-", " ")) for g in glosses]
    sentence = " ".join(words)
    return sentence[:1].upper() + sentence[1:]
