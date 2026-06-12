#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import secrets
print(f"ADMIN_API_KEY={secrets.token_urlsafe(40)}")
PY
