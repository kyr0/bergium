#!/usr/bin/env bash
set -Eeuo pipefail

PATCHSET_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-.}"

cd "$REPO"
if [[ ! -d .git ]]; then
  echo "error: $REPO is not a Git repository" >&2
  exit 2
fi

# Refuse to mix the patch series with unrelated uncommitted changes.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean" >&2
  exit 3
fi

mapfile -t patches < <(find "$PATCHSET_DIR/patches" -maxdepth 1 -type f -name '*.patch' | sort)
if [[ ${#patches[@]} -eq 0 ]]; then
  echo "error: no patches found" >&2
  exit 4
fi

git am --3way "${patches[@]}"
printf 'Applied %d Bergium Geiss patches.\n' "${#patches[@]}"
