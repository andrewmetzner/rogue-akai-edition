#!/bin/bash
set -e

DEPLOY_DIR="/www/games/rogue"

git pull
npm install
npm run build
mkdir -p "$DEPLOY_DIR"
cp -r dist/* "$DEPLOY_DIR/"
echo "Done. Deployed to $DEPLOY_DIR"
