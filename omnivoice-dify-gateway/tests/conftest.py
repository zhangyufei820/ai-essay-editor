import os
from pathlib import Path


TEST_DATA_DIR = Path(__file__).resolve().parent / ".tmp-data"
os.environ.setdefault("VOICE_GATEWAY_API_KEY", "test-key")
os.environ.setdefault("MEDIA_DIR", str(TEST_DATA_DIR / "media"))
os.environ.setdefault("JOBS_DIR", str(TEST_DATA_DIR / "jobs"))
os.environ.setdefault("ALLOWED_VOICE_IDS", "teacher_female_01,default")
os.environ.setdefault("MAX_TEXT_CHARS", "5000")

