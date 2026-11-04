#!/usr/bin/env bash
# Docker sandbox smoke test: one container = one account.
# Proves the app runs in a single container with agent + dock + tools + DB +
# files, that state persists in volumes, and that two containers with
# different volumes are isolated. Local Docker mirrors the cloud model
# (1 sandbox per account).
#
# Usage: ./scripts/smoke-docker.sh
# No API keys required. Agent-model steps are expected to fail closed with
# model_unauthorized when MODEL_API_KEY is absent (proves the fail-closed
# rule); pass MODEL_API_KEY in the environment to also run them live.
#
# Exit code: 0 when every non-key step passes, 1 otherwise.
set -euo pipefail

IMG="polydocks:smoke"
A="sbx-a-smoke"
B="sbx-b-smoke"
VA_DATA="sbx-a-data"
VA_HOME="sbx-a-home"
VB_DATA="sbx-b-data"
VB_HOME="sbx-b-home"
PA=3101
PB=3102

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL  $1"; }
have() { command -v "$1" >/dev/null 2>&1; }

cleanup_containers() {
  docker rm -f "$A" "$B" >/dev/null 2>&1 || true
}

wait_for_health() {
  local port="$1" tries=0
  while [ "$tries" -lt 30 ]; do
    if curl -fs "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then return 0; fi
    tries=$((tries + 1)); sleep 1
  done
  return 1
}

echo "--- 0. prerequisites ---"
have docker || { echo "FAIL  docker CLI missing"; exit 1; }
have curl || { echo "FAIL  curl missing"; exit 1; }
pass "docker + curl present"

echo "--- 1. build image ---"
docker build -t "$IMG" . >/tmp/sbx-build.log 2>&1 \
  && pass "docker build $IMG" \
  || { fail "docker build $IMG (see /tmp/sbx-build.log)"; exit 1; }

echo "--- 2. start sandbox A (fresh volumes) ---"
cleanup_containers
docker volume rm -f "$VA_DATA" "$VA_HOME" "$VB_DATA" "$VB_HOME" >/dev/null 2>&1 || true
docker volume create "$VA_DATA" >/dev/null
docker volume create "$VA_HOME" >/dev/null
docker run -d --name "$A" \
  -p "127.0.0.1:${PA}:3000" \
  -e DEPLOY_MODE=local \
  -v "${VA_DATA}:/app/data" \
  -v "${VA_HOME}:/app/agent-home" \
  ${MODEL_API_KEY:+-e MODEL_API_KEY="$MODEL_API_KEY"} \
  "$IMG" >/dev/null
wait_for_health "$PA" && pass "sandbox A healthy" || { fail "sandbox A never healthy"; docker logs "$A" | tail -n 20; exit 1; }

echo "--- 3. health reports local mode ---"
HEALTH="$(curl -fs "http://127.0.0.1:${PA}/api/health")"
echo "$HEALTH" | grep -q '"mode":"local"' && pass "health mode=local" || fail "health mode=local ($HEALTH)"
echo "$HEALTH" | grep -q '"ok":true' && pass "health sqlite ok" || fail "health sqlite ok ($HEALTH)"

echo "--- 4. fixed owner: spoofed caller still resolves to local ---"
THREAD="$(curl -fs -H "x-polydocks-user: mallory" "http://127.0.0.1:${PA}/api/agent/thread")"
echo "$THREAD" | grep -q '"userId":"local"' && pass "spoofed header resolves to fixed owner" || fail "fixed owner ($THREAD)"

echo "--- 5a. memory write via API (no key needed) ---"
curl -fs -X POST "http://127.0.0.1:${PA}/api/agent/memory/record" \
  -H "Content-Type: application/json" \
  -d '{"content":"smoke entry sbx-a","category":"general"}' >/dev/null \
  && pass "memory record" || fail "memory record"
curl -fs "http://127.0.0.1:${PA}/api/agent/memory" | grep -q "smoke entry sbx-a" \
  && pass "memory read-back" || fail "memory read-back"

echo "--- 5b. plugin create via direct API (actor=user, no key needed) ---"
PLUGIN_CODE='import { createRoot } from "react-dom/client"; function SmokeWidget() { return (<div className="p-4"><h1 className="text-lg">Smoke</h1><p className="text-white/60">Docker smoke widget</p></div>); } createRoot(document.getElementById("app")).render(<SmokeWidget />);'
PLUGIN_JSON="$(printf '{"op":"create","id":"smoke-widget","name":"Smoke Widget","description":"Docker smoke widget","code":%s}' "$(printf '%s' "$PLUGIN_CODE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")"
CREATE_OUT="$(curl -s -X POST "http://127.0.0.1:${PA}/api/plugins/lifecycle" \
  -H "Content-Type: application/json" \
  -d "$PLUGIN_JSON")"
echo "$CREATE_OUT" | grep -q '"ok":true' && pass "plugin create (direct API)" || { fail "plugin create ($CREATE_OUT)"; }
curl -fs "http://127.0.0.1:${PA}/api/plugins" | grep -q "smoke-widget" \
  && pass "plugin listed" || fail "plugin listed"

echo "--- 5c. deterministic fast path inside the container (EN hits, PT falls back) ---"
DISPATCH="$(docker exec "$A" bun -e '
import { matchDeterministicCommand, runDeterministicCommand } from "/app/server/agent/dispatcher.ts";
const cmds = ["open browser", "close browser", "list my dock", "switch theme to cyber", "abre o browser", "fecha o browser", "lista o dock", "muda o tema para cyber", "Build me a habit tracker"];
for (const c of cmds) {
  const t0 = Date.now();
  const m = matchDeterministicCommand(c);
  if (!m) { console.log(`CMD=${c} match=null fallback=model-loop`); continue; }
  const r = await runDeterministicCommand(m, { workspaceId: "default" });
  console.log(`CMD=${c} match=${m.kind} ok=${r.ok} latency_ms=${Date.now() - t0} deterministic=true`);
}
')"
echo "$DISPATCH"
echo "$DISPATCH" | grep -q "CMD=open browser match=dock.open ok=true" && pass "fast path: open browser" || fail "fast path: open browser"
echo "$DISPATCH" | grep -q "CMD=list my dock match=dock.list ok=true" && pass "fast path: list dock" || fail "fast path: list dock"
echo "$DISPATCH" | grep -q "CMD=switch theme to cyber match=apply_theme ok=true" && pass "fast path: switch theme" || fail "fast path: switch theme"
echo "$DISPATCH" | grep -q "CMD=abre o browser match=null" && pass "PT falls back to model loop (no false deterministic)" || fail "PT fallback"
echo "$DISPATCH" | grep -q "CMD=Build me a habit tracker match=null" && pass "heavy work falls back to model loop" || fail "heavy fallback"

echo "--- 5d. agent endpoint without key fails closed ---"
AGENT_OUT="$(curl -s -X POST "http://127.0.0.1:${PA}/api/agent" -H "Content-Type: application/json" -d '{"prompt":"Build me a habit tracker"}' || true)"
if [ -z "${MODEL_API_KEY:-}" ]; then
  echo "$AGENT_OUT" | grep -qi "model_unauthorized\|MODEL_API_KEY" && pass "agent fails closed without key" || fail "agent fail-closed ($AGENT_OUT)"
else
  echo "SKIP  agent live run (key present; manual check)"
fi

echo "--- 6. persistence: recreate container on the SAME volumes ---"
docker rm -f "$A" >/dev/null
docker run -d --name "$A" \
  -p "127.0.0.1:${PA}:3000" \
  -e DEPLOY_MODE=local \
  -v "${VA_DATA}:/app/data" \
  -v "${VA_HOME}:/app/agent-home" \
  "$IMG" >/dev/null
wait_for_health "$PA" && pass "sandbox A restarted" || { fail "sandbox A restart"; exit 1; }
curl -fs "http://127.0.0.1:${PA}/api/plugins" | grep -q "smoke-widget" \
  && pass "plugin survived restart" || fail "plugin survived restart"
curl -fs "http://127.0.0.1:${PA}/api/agent/memory" | grep -q "smoke entry sbx-a" \
  && pass "memory survived restart" || fail "memory survived restart"

echo "--- 7. isolation: sandbox B on FRESH volumes ---"
docker volume create "$VB_DATA" >/dev/null
docker volume create "$VB_HOME" >/dev/null
docker run -d --name "$B" \
  -p "127.0.0.1:${PB}:3000" \
  -e DEPLOY_MODE=local \
  -v "${VB_DATA}:/app/data" \
  -v "${VB_HOME}:/app/agent-home" \
  "$IMG" >/dev/null
wait_for_health "$PB" && pass "sandbox B healthy" || { fail "sandbox B never healthy"; exit 1; }
curl -fs "http://127.0.0.1:${PB}/api/plugins" | grep -q "smoke-widget" \
  && fail "isolation: B sees A plugin (LEAK)" || pass "isolation: B has no A plugin"
curl -fs "http://127.0.0.1:${PB}/api/agent/memory" | grep -q "smoke entry sbx-a" \
  && fail "isolation: B sees A memory (LEAK)" || pass "isolation: B has no A memory"
docker exec "$B" sh -c 'ls /app/data' | grep -qi "polydocks" \
  && pass "B has its own DB file" || fail "B DB file missing"
A_MOUNT="$(docker volume inspect "$VA_DATA" --format '{{.Mountpoint}}')"
B_MOUNT="$(docker volume inspect "$VB_DATA" --format '{{.Mountpoint}}')"
[ "$A_MOUNT" != "$B_MOUNT" ] && pass "volumes are distinct mounts" || fail "volumes share a mountpoint (LEAK)"

echo "--- 8. teardown containers (volumes kept for inspection) ---"
cleanup_containers
pass "containers removed, volumes kept ($VA_DATA $VA_HOME $VB_DATA $VB_HOME)"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
