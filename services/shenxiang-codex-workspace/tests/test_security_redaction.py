from urllib.parse import quote

from app.security import redact


def test_redact_replaces_plain_and_url_encoded_secrets():
    secret = "sk-test/with+symbols=123456789"
    text = f"plain={secret} encoded={quote(secret, safe='')}"

    redacted = redact(text, [secret])

    assert secret not in redacted
    assert quote(secret, safe="") not in redacted
    assert redacted.count("[REDACTED]") == 2
