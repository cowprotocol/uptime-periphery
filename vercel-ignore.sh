#!/usr/bin/env bash
set -euo pipefail

# Vercel provides these; fall back safely if missing
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURR="${VERCEL_GIT_COMMIT_SHA:-}"

# If we don't have a previous SHA (first deploy), build.
if [ -z "$PREV" ] || [ -z "$CURR" ]; then
  echo "No previous SHA; allow build"
  exit 1
fi

# Only build when router-related files changed
if git diff --name-only "$PREV" "$CURR" -- \
  | grep -E '^(src/|vercel\.json|package\.json)'; then
  echo "Router files changed; allow build"
  exit 1
else
  echo "No router changes; skip build"
  exit 0
fi
