#!/bin/bash
set -e

cd ~/www/rogue
git pull
npm install
npm run build
cp -r dist/* ~/www/rogue/
echo "Done."
