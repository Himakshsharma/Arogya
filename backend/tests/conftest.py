import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Isolated database for every test session
_tmp = tempfile.mkdtemp()
os.environ["AROGYA_DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ["AROGYA_STATIC_DIR"] = os.path.join(_tmp, "no-static")
os.environ.setdefault("AROGYA_TRANSLATION_ENGINE", "phrasebook")


@pytest.fixture()
def db(tmp_path):
    import app.db as dbmod
    previous = dbmod._db
    database = dbmod.Database(str(tmp_path / "unit.db"))
    dbmod.set_db(database)
    yield database
    dbmod._db = previous
