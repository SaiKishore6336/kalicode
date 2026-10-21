#!/usr/bin/env bash
# Build a self-contained KaliCode .deb package.
#
#   npm run build:deb        (or: bash scripts/build-deb.sh)
#
# Result: dist-packages/kalicode_<version>_<arch>.deb
# The package bundles the Electron runtime, so it needs no Node.js, npm,
# network access or this source directory on the target machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
ARCH="$(dpkg --print-architecture)"
OUT_DIR="$ROOT/dist-packages"
DEB="$OUT_DIR/kalicode_${VERSION}_${ARCH}.deb"
INSTALL_DIR="/opt/kalicode"

for required in package.json electron/main.cjs electron/preload.cjs electron/pty_bridge.py assets/icon.png; do
  [[ -e "$ROOT/$required" ]] || { echo "error: missing $required" >&2; exit 1; }
done

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "error: dpkg-deb is required (apt install dpkg)." >&2
  exit 1
fi

# Build the renderer bundle so the package always matches the sources.
if command -v corepack >/dev/null 2>&1; then
  PM=(corepack npm)
elif command -v npm >/dev/null 2>&1; then
  PM=(npm)
else
  echo "error: npm/corepack not found; cannot build the renderer." >&2
  exit 1
fi

echo "Building renderer..."
"${PM[@]}" run build

ELECTRON_DIST="$ROOT/node_modules/electron/dist"
[[ -x "$ELECTRON_DIST/electron" ]] || {
  echo "error: Electron runtime missing at $ELECTRON_DIST" >&2
  echo "Run 'corepack npm install' first." >&2
  exit 1
}

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p \
  "$STAGE/DEBIAN" \
  "$STAGE/opt/kalicode" \
  "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" \
  "$STAGE/usr/share/icons/hicolor/512x512/apps" \
  "$STAGE/usr/share/pixmaps"

# Application payload (renderer is already bundled into dist/).
for item in dist electron assets package.json README.md; do
  [[ -e "$ROOT/$item" ]] && cp -a "$ROOT/$item" "$STAGE/opt/kalicode/$item"
done

mkdir -p "$STAGE/opt/kalicode/node_modules/electron"
cp -a "$ELECTRON_DIST" "$STAGE/opt/kalicode/node_modules/electron/dist"

# System launcher.
cat > "$STAGE/usr/bin/kalicode" <<EOF
#!/bin/sh
exec "$INSTALL_DIR/node_modules/electron/dist/electron" "$INSTALL_DIR" "\$@"
EOF
chmod 755 "$STAGE/usr/bin/kalicode"

# Menu entry. Paths are stable because dpkg installs the app under /opt.
cat > "$STAGE/usr/share/applications/kalicode.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=KaliCode
GenericName=Code Editor
Comment=Fast Kali-native code workspace with Monaco, Git, search, and a real terminal
Exec=/usr/bin/kalicode %U
TryExec=/usr/bin/kalicode
Icon=kalicode
Terminal=false
Categories=Development;IDE;
Keywords=code;editor;ide;terminal;git;development;
MimeType=text/plain;inode/directory;
StartupNotify=true
StartupWMClass=KaliCode
EOF

install -Dm644 "$ROOT/assets/icon.png" "$STAGE/usr/share/icons/hicolor/512x512/apps/kalicode.png"
install -Dm644 "$ROOT/assets/icon.png" "$STAGE/usr/share/pixmaps/kalicode.png"

cat > "$STAGE/DEBIAN/control" <<EOF
Package: kalicode
Version: $VERSION
Section: devel
Priority: optional
Architecture: $ARCH
Maintainer: KaliCode Maintainers <maintainers@kalicode.local>
Installed-Size: $(du -sk "$STAGE" | cut -f1)
Depends: libgtk-3-0t64 | libgtk-3-0, libnss3, libgbm1, libasound2t64 | libasound2, libxss1, libxtst6, libatspi2.0-0t64 | libatspi2.0-0, libsecret-1-0, libuuid1, libnotify4, xdg-utils, python3
Recommends: git
Description: Fast Kali-native code workspace
 KaliCode is a desktop code editor with a Monaco-powered editor, file
 explorer, project search and replace, Git integration, an integrated
 PTY terminal, run tools, themes, and session restore.
EOF

cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if [ -f /opt/kalicode/node_modules/electron/dist/chrome-sandbox ]; then
  chmod 4755 /opt/kalicode/node_modules/electron/dist/chrome-sandbox 2>/dev/null || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
exit 0
EOF

cat > "$STAGE/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
exit 0
EOF

chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/postrm"

mkdir -p "$OUT_DIR"
rm -f "$DEB"
echo "Packing $DEB ..."
dpkg-deb --root-owner-group --build "$STAGE" "$DEB" >/dev/null

echo
echo "Built: $DEB ($(du -h "$DEB" | cut -f1))"
echo "Install with:"
echo "  sudo apt install ./${DEB#$ROOT/}"
echo "then launch KaliCode from the application menu."
