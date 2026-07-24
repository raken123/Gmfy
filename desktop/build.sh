#!/usr/bin/env bash
# Build Gmfy desktop apps with Electron.
# On Linux this produces AppImage + deb and (cross-build) the Windows installer.
# macOS targets (dmg/zip) must be built on a Mac — or use the GitHub Actions workflow.
set -euo pipefail
cd "$(dirname "$0")"

# assemble the web app into www/
rm -rf www
mkdir -p www
cp -r ../index.html ../css ../js ../vendor www/

npm install

case "$(uname -s)" in
  Darwin) npx electron-builder --mac ;;
  Linux)  npx electron-builder --linux; npx electron-builder --win || echo "(Windows cross-build skipped)" ;;
  *)      npx electron-builder --win ;;
esac

echo
echo "Artifacts in: $(pwd)/dist/"
