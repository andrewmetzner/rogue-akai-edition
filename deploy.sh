#!/bin/bash
set -e

git pull
git checkout index.html
npm install
npm run build
cp -r dist/* ./
echo "Done."
