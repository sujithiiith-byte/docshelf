#!/bin/sh
# Builds dist/docshelf-<version>.zip for the Chrome Web Store.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)
mkdir -p dist
out="dist/docshelf-$version.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '.*' -x '*/.*')
echo "$out ($(du -h "$out" | cut -f1))"
