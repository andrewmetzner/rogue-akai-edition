#!/bin/bash
set -e

cd ~/www/rogue
git pull
git checkout index.html
npm install
npm run build
cp -r dist/* ~/www/rogue/
echo "Done."
