#!/bin/bash

cd "$(dirname "$0")"

echo "[ameize-client] remove old deps"
rm -Rf node_modules
rm -f package-lock.json

echo "[ameize-client] pull from git repository"
# force origin to https to bypass ssh problems
git remote remove origin
git remote add origin https://github.com/ircam-jstools/ameize-client
git pull origin master
echo "[ameize-client] install"
npm install
echo "[ameize-client] transpile"
npm run transpile

echo "[ameize-client] restart daemon"
sudo systemctl restart ameize-client-daemon.service
