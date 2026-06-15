#!/usr/bin/env bash
set -Eeuo pipefail

# Reconcile a small set of Docker DOCKER-USER firewall rules.
# The rules only block traffic entering from the public interface into selected
# Docker bridge networks. Container-to-container and localhost traffic remain
# untouched.

DRY_RUN="${DRY_RUN:-0}"
PUBLIC_IFACE="${PUBLIC_IFACE:-}"
IPTABLES="${IPTABLES:-iptables}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing command: $1"
    exit 127
  fi
}

detect_public_iface() {
  if [[ -n "$PUBLIC_IFACE" ]]; then
    printf '%s\n' "$PUBLIC_IFACE"
    return
  fi

  ip route show default 0.0.0.0/0 | awk '/default/ { print $5; exit }'
}

network_bridge() {
  local network="$1"
  local bridge id

  if ! docker network inspect "$network" >/dev/null 2>&1; then
    return 1
  fi

  bridge="$(docker network inspect "$network" --format '{{ index .Options "com.docker.network.bridge.name" }}' 2>/dev/null || true)"
  if [[ -n "$bridge" && "$bridge" != "<no value>" ]]; then
    printf '%s\n' "$bridge"
    return
  fi

  id="$(docker network inspect "$network" --format '{{.Id}}' 2>/dev/null || true)"
  if [[ -n "$id" ]]; then
    printf 'br-%s\n' "${id:0:12}"
    return
  fi

  return 1
}

ensure_rule() {
  local comment="$1"
  shift
  local rule=("$@")

  if "$IPTABLES" -C DOCKER-USER "${rule[@]}" >/dev/null 2>&1; then
    log "rule exists: $comment"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "would add: $comment"
    printf '  %q' "$IPTABLES" -A DOCKER-USER "${rule[@]}"
    printf '\n'
    return
  fi

  "$IPTABLES" -A DOCKER-USER "${rule[@]}"
  log "added: $comment"
}

ensure_established_return() {
  local rule=(-m conntrack --ctstate RELATED,ESTABLISHED -j RETURN)

  if "$IPTABLES" -C DOCKER-USER "${rule[@]}" >/dev/null 2>&1; then
    log "rule exists: established return"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "would add: established return"
    printf '  %q' "$IPTABLES" -I DOCKER-USER 1 "${rule[@]}"
    printf '\n'
    return
  fi

  "$IPTABLES" -I DOCKER-USER 1 "${rule[@]}"
  log "added: established return"
}

apply_network_rule() {
  local label="$1"
  local network="$2"
  local ports="$3"
  local public_iface="$4"
  local bridge

  if ! bridge="$(network_bridge "$network")"; then
    log "skip $label: docker network not found: $network"
    return
  fi

  ensure_rule "$label ($network $bridge ports $ports)" \
    -i "$public_iface" -o "$bridge" -p tcp \
    -m multiport --dports "$ports" \
    -m comment --comment "shenxiang:$label" \
    -j DROP
}

main() {
  require_command awk
  require_command docker
  require_command "$IPTABLES"
  if [[ -z "$PUBLIC_IFACE" ]]; then
    require_command ip
  fi

  local public_iface
  public_iface="$(detect_public_iface)"
  if [[ -z "$public_iface" ]]; then
    log "cannot detect public interface"
    exit 1
  fi

  if [[ "$DRY_RUN" != "1" ]]; then
    "$IPTABLES" -N DOCKER-USER >/dev/null 2>&1 || true
  fi

  log "public_iface=$public_iface dry_run=$DRY_RUN"
  ensure_established_return

  # Dify direct web/API and plugin daemon should be reached via OpenResty or
  # Docker networks, not directly from the public interface.
  apply_network_rule "block-dify-direct-web-and-plugin" "docker_default" "80,8443,5003" "$public_iface"

  # Word Card data stores are internal dependencies. The backend container is
  # intentionally not blocked here because it may be reviewed separately as a
  # product API surface.
  apply_network_rule "block-word-card-datastores" "word-card-api_default" "5432,6379" "$public_iface"

  # essay-ai-suite is a production dependency for internal OCR/document flows.
  # Public product traffic should go through the main site or Dify, not :3100.
  apply_network_rule "block-essay-ai-suite-direct" "1panel-network" "3100" "$public_iface"

  log "complete"
}

main "$@"
