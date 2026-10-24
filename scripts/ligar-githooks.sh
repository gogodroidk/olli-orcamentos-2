#!/usr/bin/env bash
# Liga os hooks versionados em .githooks (uma vez por clone/worktree).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
chmod +x .githooks/*
git config core.hooksPath .githooks
echo "hooks ativos: $(git config core.hooksPath)"
