#!/usr/bin/env bash
set -euo pipefail
REPO_NAME=${1:-smv-logistics-pwa}
git init
git add .
git commit -m "init: SMV logistics PWA (OTP + check-user)"
# If you have GitHub CLI:
if command -v gh >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
else
  echo "Now create a repo named $REPO_NAME on GitHub and run:"
  echo "  git remote add origin https://github.com/<you>/$REPO_NAME.git"
  echo "  git branch -M main"
  echo "  git push -u origin main"
fi
echo "Next, on Render: New -> Blueprint, select this repo (render.yaml)."
