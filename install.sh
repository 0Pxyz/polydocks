#!/usr/bin/env bash
#
# Polydocks installer: clones the repo, installs deps and starts the dock.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/0Pxyz/polydocks/main/install.sh | bash
#   cd polydocks && cp .env.example .env  # add MODEL_API_KEY (+ TINYFISH_API_KEY)
#   polydocks
#
set -euo pipefail

REPO_URL="${POLYDOCKS_REPO_URL:-https://github.com/0Pxyz/polydocks.git}"
DEST_DIR="${POLYDOCKS_DIR:-polydocks}"

info() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

if ! command -v bun >/dev/null 2>&1; then
  fail "Bun 1.1+ is required: https://bun.sh (curl -fsSL https://bun.sh/install | bash)"
fi
if ! command -v git >/dev/null 2>&1; then
  fail "git is required to clone ${REPO_URL}"
fi

if [ -d "${DEST_DIR}" ]; then
  info "Using existing directory ./${DEST_DIR} (skipping clone)."
else
  info "Cloning ${REPO_URL} into ./${DEST_DIR}…"
  git clone "${REPO_URL}" "${DEST_DIR}"
fi

cd "${DEST_DIR}"
info "Installing dependencies (bun install)…"
bun install

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  info "Created .env from .env.example — add your MODEL_API_KEY (dev.meta.ai) and TINYFISH_API_KEY, then run:"
else
  info "Next:"
fi
info "  bun run dev    # front + server on http://localhost:3000"
info "  bun bin/polydocks status"
