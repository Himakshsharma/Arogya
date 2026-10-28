from app.services.catalog import lexicon
from app.services.gloss import gloss_to_sentence, text_to_gloss, transliterate


def g(text, lang=None):
    return text_to_gloss(text, lang)["gloss_text"]


def test_question_word_moves_to_end():
    assert g("Where does it hurt?") == "PAIN WHERE"


def test_drops_function_words_and_maps_synonyms():
    assert g("I have a headache") == "ME HEAD PAIN HAVE"


def test_time_first_negation_last():
    assert g("I did not sleep at night") == "NIGHT ME SLEEP NOT"


def test_phrase_match():
    assert g("Take this after food.") == "FOOD AFTER TAKE"
    assert g("Thank you") == "THANK-YOU"


def test_yes_no_question_flag():
    out = text_to_gloss("Do you have a fever?")
    assert out["is_question"] is True
    assert out["gloss_text"] == "YOU FEVER HAVE"


def test_unknown_word_is_fingerspelled():
    out = text_to_gloss("My name is Ravi")
    spelled = [t for t in out["tokens"] if t["kind"] == "spell"]
    assert spelled and spelled[0]["letters"] == "RAVI"


def test_numbers():
    assert g("Take 2 tablets") == "TWO TABLET TAKE"
    toks = text_to_gloss("for 10 days")["tokens"]
    assert {"gloss": "10", "kind": "spell", "letters": "10", "source": "number"} in toks


def test_hindi_input():
    out = text_to_gloss("आपको बुखार है?")
    assert out["lang"] == "hi"
    assert out["gloss_text"] == "YOU FEVER"
    assert g("दर्द कहाँ है?") == "PAIN WHERE"
    assert g("खाने के बाद दवा लीजिए") == "FOOD AFTER MEDICINE TAKE"


def test_hindi_name_transliterated():
    assert transliterate("रवि") == "ravi"
    assert transliterate("मीरा") == "mira"


def test_every_output_sign_exists_in_lexicon():
    signs = set(lexicon()["signs"])
    sentences = ["How are you feeling today?", "Please lie down and take a deep breath.",
                 "You need a blood test tomorrow morning", "मुझे चक्कर आ रहे हैं", "Open your mouth"]
    for s in sentences:
        for t in text_to_gloss(s)["tokens"]:
            if t["kind"] == "sign":
                assert t["gloss"] in signs, (s, t)


def test_gloss_back_to_text():
    assert gloss_to_sentence(["ME", "HEAD", "PAIN"]) == "I head pain"
    assert "दर्द" in gloss_to_sentence(["ME", "HEAD", "PAIN"], "hi")
