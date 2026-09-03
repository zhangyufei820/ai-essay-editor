#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"
const DEFAULT_EXPECTED_CURRENT_URL = "http://172.17.0.1:18789/v1"
const DEFAULT_TARGET_URL = "http://1Panel-openclaw-z5b8:18789/v1"

function usage() {
  return [
    "Usage: node scripts/dify-repair-openclaw-endpoint.mjs [options]",
    "",
    "Audits the Dify OpenClaw model endpoint by default. Use --apply to update it.",
    "",
    "Options:",
    "  --apply                         Apply the endpoint update after all preflight checks pass",
    "  --host <ssh-host>               SSH host (default: root@43.154.111.156)",
    "  --expected-current-url <url>    Exact current value required before an update",
    "  --target-url <url>              New internal OpenClaw endpoint",
    "  --help                          Show this help",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    apply: false,
    help: false,
    host: DEFAULT_HOST,
    expectedCurrentUrl: DEFAULT_EXPECTED_CURRENT_URL,
    targetUrl: process.env.OPENCLAW_DIFY_INTERNAL_URL || DEFAULT_TARGET_URL,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--help" || arg === "-h") {
      args.help = true
    } else if (arg === "--host") {
      args.host = argv[++index]
    } else if (arg === "--expected-current-url") {
      args.expectedCurrentUrl = argv[++index]
    } else if (arg === "--target-url") {
      args.targetUrl = argv[++index]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!args.host || !args.expectedCurrentUrl || !args.targetUrl) {
    throw new Error("--host, --expected-current-url, and --target-url require non-empty values")
  }

  return args
}

function validateEndpoint(rawUrl, label) {
  const endpoint = new URL(rawUrl)
  if (endpoint.protocol !== "http:") throw new Error(`${label} must use the internal http protocol`)
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error(`${label} must not contain credentials, query parameters, or fragments`)
  }
  if (endpoint.pathname.replace(/\/$/, "") !== "/v1") {
    throw new Error(`${label} must end with /v1`)
  }
  if (endpoint.port !== "18789") throw new Error(`${label} must use port 18789`)
  return endpoint.toString().replace(/\/$/, "")
}

function buildRemoteProgram({ apply, expectedCurrentUrl, targetUrl }) {
  return `
import json
import socket
import urllib.error
import urllib.parse
import urllib.request

from app import app
from core.helper import encrypter
from core.helper.model_provider_cache import ProviderCredentialsCache, ProviderCredentialsCacheType
from libs.datetime_utils import naive_utc_now
from models.engine import db
from sqlalchemy import text

APPLY = ${apply ? "True" : "False"}
EXPECTED_CURRENT_URL = ${JSON.stringify(expectedCurrentUrl)}
TARGET_URL = ${JSON.stringify(targetUrl)}
PROVIDER_NAME = "langgenius/openai_api_compatible/openai_api_compatible"
MODEL_NAME = "openclaw"


def fail(message):
    raise RuntimeError(message)


def probe_target(credentials, tenant_id):
    parsed = urllib.parse.urlparse(TARGET_URL)
    with socket.create_connection((parsed.hostname, parsed.port or 80), timeout=5):
        pass

    encrypted_key = credentials.get("api_key")
    if not encrypted_key:
        fail("OpenClaw credential has no api_key")
    api_key = encrypter.decrypt_token(tenant_id=tenant_id, token=encrypted_key)
    request = urllib.request.Request(
        TARGET_URL.rstrip("/") + "/models",
        headers={"Authorization": "Bearer " + api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status != 200:
                fail(f"OpenClaw target preflight returned HTTP {response.status}")
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        fail(f"OpenClaw target preflight returned HTTP {error.code}")

    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        fail("OpenClaw target preflight returned an invalid models payload")
    return len(payload["data"])


with app.app_context():
    records = db.session.execute(
        text("""
            SELECT id::text, tenant_id::text, encrypted_config
            FROM provider_model_credentials
            WHERE provider_name = :provider_name
              AND model_name = :model_name
              AND model_type IN ('text-generation', 'llm')
        """),
        {"provider_name": PROVIDER_NAME, "model_name": MODEL_NAME},
    ).mappings().all()
    if len(records) != 1:
        fail(f"Expected exactly one OpenClaw credential, found {len(records)}")

    credential = dict(records[0])
    credentials = json.loads(credential["encrypted_config"] or "{}")
    current_endpoint = str(credentials.get("endpoint_url") or "").rstrip("/")
    expected_endpoint = EXPECTED_CURRENT_URL.rstrip("/")
    target_endpoint = TARGET_URL.rstrip("/")
    if current_endpoint not in {expected_endpoint, target_endpoint}:
        fail(
            "OpenClaw endpoint precondition failed: "
            f"expected {expected_endpoint} or {target_endpoint}, got {current_endpoint or '[empty]'}"
        )

    model_record = db.session.execute(
        text("SELECT id::text FROM provider_models WHERE credential_id = CAST(:credential_id AS uuid)"),
        {"credential_id": credential["id"]},
    ).mappings().one_or_none()
    if not model_record:
        fail("OpenClaw provider model record was not found")

    model_count = probe_target(credentials, credential["tenant_id"])
    result = {
        "mode": "apply" if APPLY else "audit",
        "current_endpoint": current_endpoint,
        "target_endpoint": target_endpoint,
        "target_probe": "ok",
        "target_model_count": model_count,
        "changed": current_endpoint != target_endpoint,
    }

    if not APPLY:
        print(json.dumps(result, ensure_ascii=False))
    else:
        original_config = credential["encrypted_config"]
        updated = False
        try:
            if current_endpoint != target_endpoint:
                credentials["endpoint_url"] = target_endpoint
                update_result = db.session.execute(
                    text("""
                        UPDATE provider_model_credentials
                        SET encrypted_config = :new_config, updated_at = :updated_at
                        WHERE id = CAST(:credential_id AS uuid)
                          AND encrypted_config = :original_config
                    """),
                    {
                        "new_config": json.dumps(credentials),
                        "updated_at": naive_utc_now(),
                        "credential_id": credential["id"],
                        "original_config": original_config,
                    },
                )
                if update_result.rowcount != 1:
                    db.session.rollback()
                    fail("OpenClaw credential changed concurrently; no update was applied")
                db.session.commit()
                updated = True

            ProviderCredentialsCache(
                tenant_id=credential["tenant_id"],
                identity_id=model_record["id"],
                cache_type=ProviderCredentialsCacheType.MODEL,
            ).delete()
            result["action"] = "updated" if current_endpoint != target_endpoint else "cache_refreshed"
            print(json.dumps(result, ensure_ascii=False))
        except Exception:
            db.session.rollback()
            if updated:
                db.session.execute(
                    text("""
                        UPDATE provider_model_credentials
                        SET encrypted_config = :original_config, updated_at = :updated_at
                        WHERE id = CAST(:credential_id AS uuid)
                    """),
                    {
                        "original_config": original_config,
                        "updated_at": naive_utc_now(),
                        "credential_id": credential["id"],
                    },
                )
                db.session.commit()
                ProviderCredentialsCache(
                    tenant_id=credential["tenant_id"],
                    identity_id=model_record["id"],
                    cache_type=ProviderCredentialsCacheType.MODEL,
                ).delete()
            raise
`
}

function runRemote(host, program) {
  const result = spawnSync(
    "ssh",
    [host, "docker", "exec", "-i", "docker-api-1", "/app/api/.venv/bin/python", "-"],
    {
      input: program,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `remote command failed with code ${result.status}`)
  }
  process.stdout.write(result.stdout)
}

try {
  const args = parseArgs(process.argv)
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    process.exit(0)
  }
  args.expectedCurrentUrl = validateEndpoint(args.expectedCurrentUrl, "--expected-current-url")
  args.targetUrl = validateEndpoint(args.targetUrl, "--target-url")
  runRemote(args.host, buildRemoteProgram(args))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
