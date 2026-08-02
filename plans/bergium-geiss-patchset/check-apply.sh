#!/usr/bin/env bash
set -Eeuo pipefail

PATCHSET_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-.}"
cd "$REPO"

git apply --check "$PATCHSET_DIR/bergium-geiss-core-combined.patch"
echo "Combined patch applies cleanly."
