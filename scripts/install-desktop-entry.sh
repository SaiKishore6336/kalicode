#!/usr/bin/env bash
# Kept for backwards compatibility. Use ../install.sh directly instead.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/install.sh" "$@"
