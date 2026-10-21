#!/usr/bin/env bash
# KaliCode installer — works from any checkout location, for any user.
#
#   ./install.sh                 install for the current user (no sudo)
#   ./install.sh --system        install system-wide under /opt (uses sudo)
#   ./install.sh --prefix DIR    install everything under DIR (portable/test)
#   ./install.sh --no-menu       skip the application-menu entry
#   ./install.sh --skip-build    do not build dist/ if it is missing
#
# The menu entry, launcher and icon are generated from the actual install
# location; nothing is hardcoded to the person who built the project.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="user"
PREFIX=""
MENU=1
BUILD=1

usage() {
  cat <<'EOF'
Install KaliCode.

Usage: ./install.sh [options]

Options:
  --system        Install to /opt/kalicode, /usr/local/bin, /usr/share
                  (asks for sudo unless already root).
  --prefix DIR    Install the app, launcher, menu entry and icon under DIR.
  --no-menu       Do not create an application-menu entry.
  --skip-build    Fail instead of building dist/ when it is missing.
  -h, --help      Show this help.

Default (no options) installs for the current user:
  app      $XDG_DATA_HOME/kalicode        (~/.local/share/kalicode)
  command  ~/.local/bin/kalicode
  menu     $XDG_DATA_HOME/applications/kalicode.desktop
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --system)
      MODE="system"
      shift
      ;;
    --prefix)
      [[ $# -ge 2 ]] || { echo "error: --prefix needs a directory" >&2; exit 2; }
      MODE="prefix"
      PREFIX="$2"
      shift 2
      ;;
    --no-menu)
      MENU=0
      shift
      ;;
    --skip-build)
      BUILD=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

SUDO=()
if [[ "$MODE" == "system" ]]; then
  APP_DIR="/opt/kalicode"
  BIN_DIR="/usr/local/bin"
  APPS_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
  PIXMAP_DIR="/usr/share/pixmaps"
  if [[ $EUID -ne 0 ]]; then
    SUDO=(sudo)
  fi
elif [[ "$MODE" == "prefix" ]]; then
  mkdir -p "$PREFIX"
  APP_DIR="$(cd "$PREFIX" && pwd)"
  BIN_DIR="$APP_DIR/bin"
  APPS_DIR="$APP_DIR/applications"
  ICON_DIR="$APP_DIR/icons/hicolor/512x512/apps"
  PIXMAP_DIR="$APP_DIR/icons"
else
  DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
  APP_DIR="$DATA_HOME/kalicode"
  BIN_DIR="$HOME/.local/bin"
  APPS_DIR="$DATA_HOME/applications"
  ICON_DIR="$DATA_HOME/icons/hicolor/512x512/apps"
  PIXMAP_DIR="$DATA_HOME/pixmaps"
fi

# Pick a package manager (npm itself is often missing on Kali; corepack works).
PM=()
if command -v corepack >/dev/null 2>&1; then
  PM=(corepack npm)
elif command -v npm >/dev/null 2>&1; then
  PM=(npm)
fi

ELECTRON_DIST="$SRC_DIR/node_modules/electron/dist"
ELECTRON_BIN="$ELECTRON_DIST/electron"
BUNDLE_ELECTRON=0
if [[ -x "$ELECTRON_BIN" ]]; then
  BUNDLE_ELECTRON=1
fi

# A source checkout that has never been set up can install its own deps.
if [[ ! -d "$SRC_DIR/node_modules" ]]; then
  if ((${#PM[@]})); then
    echo "Installing JavaScript dependencies (first run)..."
    (cd "$SRC_DIR" && "${PM[@]}" install --no-audit --no-fund)
  else
    echo "error: node_modules is missing and npm/corepack was not found." >&2
    echo "Install Node.js or download a .deb release instead." >&2
    exit 1
  fi
fi

if [[ $BUNDLE_ELECTRON -eq 0 ]] && ! command -v electron >/dev/null 2>&1; then
  echo "error: no Electron runtime found." >&2
  echo "Run '${PM[*]:-npm} install' in $SRC_DIR or install electron from your distro." >&2
  exit 1
fi

if [[ ! -f "$SRC_DIR/dist/index.html" ]]; then
  if [[ $BUILD -eq 0 ]]; then
    echo "error: dist/index.html is missing and --skip-build was given." >&2
    exit 1
  fi
  if ((${#PM[@]})); then
    echo "Building the renderer..."
    (cd "$SRC_DIR" && "${PM[@]}" run build)
  else
    echo "error: dist/ is missing and npm/corepack was not found." >&2
    exit 1
  fi
fi

[[ -f "$SRC_DIR/dist/index.html" ]] || {
  echo "error: the build did not produce dist/index.html." >&2
  exit 1
}

echo "Installing KaliCode"
echo "  from: $SRC_DIR"
echo "  to:   $APP_DIR"

"${SUDO[@]}" mkdir -p "$APP_DIR" "$BIN_DIR" "$APPS_DIR" "$ICON_DIR" "$PIXMAP_DIR"

# Runtime files only: the renderer is already bundled into dist/.
for item in dist electron assets package.json README.md; do
  if [[ -e "$SRC_DIR/$item" ]]; then
    "${SUDO[@]}" rm -rf "$APP_DIR/$item"
    "${SUDO[@]}" cp -a "$SRC_DIR/$item" "$APP_DIR/$item"
  fi
done

if [[ $BUNDLE_ELECTRON -eq 1 ]]; then
  "${SUDO[@]}" mkdir -p "$APP_DIR/node_modules/electron"
  "${SUDO[@]}" rm -rf "$APP_DIR/node_modules/electron/dist"
  "${SUDO[@]}" cp -a "$ELECTRON_DIST" "$APP_DIR/node_modules/electron/dist"
fi

if [[ -f "$SRC_DIR/assets/icon.png" ]]; then
  "${SUDO[@]}" install -Dm644 "$SRC_DIR/assets/icon.png" "$ICON_DIR/kalicode.png"
  "${SUDO[@]}" install -Dm644 "$SRC_DIR/assets/icon.png" "$PIXMAP_DIR/kalicode.png"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/kalicode" <<EOF
#!/usr/bin/env bash
APP_DIR="$APP_DIR"
if [[ -x "\$APP_DIR/node_modules/electron/dist/electron" ]]; then
  exec "\$APP_DIR/node_modules/electron/dist/electron" "\$APP_DIR" "\$@"
fi
exec electron "\$APP_DIR" "\$@"
EOF
"${SUDO[@]}" install -Dm755 "$TMP_DIR/kalicode" "$BIN_DIR/kalicode"

if [[ $MENU -eq 1 ]]; then
  cat > "$TMP_DIR/kalicode.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=KaliCode
GenericName=Code Editor
Comment=Fast Kali-native code workspace with Monaco, Git, search, and a real terminal
Exec="$BIN_DIR/kalicode" %U
TryExec=$BIN_DIR/kalicode
Icon=$ICON_DIR/kalicode.png
Terminal=false
Categories=Development;IDE;
Keywords=code;editor;ide;terminal;git;development;
MimeType=text/plain;inode/directory;
StartupNotify=true
StartupWMClass=KaliCode
EOF
  "${SUDO[@]}" install -Dm644 "$TMP_DIR/kalicode.desktop" "$APPS_DIR/kalicode.desktop"

  if command -v update-desktop-database >/dev/null 2>&1; then
    "${SUDO[@]}" update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    "${SUDO[@]}" gtk-update-icon-cache -q -t "${ICON_DIR%/512x512/apps}" >/dev/null 2>&1 || true
  fi
  if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$APPS_DIR/kalicode.desktop" || true
  fi
fi

# Self-contained uninstaller, next to the installed app.
cat > "$TMP_DIR/uninstall.sh" <<'UNINSTALL'
#!/usr/bin/env bash
set -euo pipefail
SUDO=()
if [[ ! -w "@BIN_DIR@" ]]; then
  SUDO=(sudo)
fi
"${SUDO[@]}" rm -rf "@APP_DIR@"
"${SUDO[@]}" rm -f "@BIN_DIR@/kalicode" "@APPS_DIR@/kalicode.desktop" \
  "@ICON_DIR@/kalicode.png" "@PIXMAP_DIR@/kalicode.png"
if command -v update-desktop-database >/dev/null 2>&1; then
  "${SUDO[@]}" update-desktop-database "@APPS_DIR@" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  "${SUDO[@]}" gtk-update-icon-cache -q -t "@ICON_THEME_DIR@" >/dev/null 2>&1 || true
fi
echo "KaliCode removed."
echo "Your settings were kept in ${XDG_CONFIG_HOME:-$HOME/.config}/KaliCode"
UNINSTALL
sed -i \
  -e "s|@APP_DIR@|$APP_DIR|g" \
  -e "s|@BIN_DIR@|$BIN_DIR|g" \
  -e "s|@APPS_DIR@|$APPS_DIR|g" \
  -e "s|@ICON_DIR@|$ICON_DIR|g" \
  -e "s|@PIXMAP_DIR@|$PIXMAP_DIR|g" \
  -e "s|@ICON_THEME_DIR@|${ICON_DIR%/512x512/apps}|g" \
  "$TMP_DIR/uninstall.sh"
"${SUDO[@]}" install -Dm755 "$TMP_DIR/uninstall.sh" "$APP_DIR/uninstall.sh"

echo
echo "KaliCode installed."
echo "  app:       $APP_DIR"
echo "  command:   $BIN_DIR/kalicode"
if [[ $MENU -eq 1 ]]; then
  echo "  menu entry:$APPS_DIR/kalicode.desktop"
  echo "  launcher:  visible in your application menu (search for KaliCode)"
fi
echo "  uninstall: $APP_DIR/uninstall.sh"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo
  echo "Note: $BIN_DIR is not on your PATH; add it to use the 'kalicode' command."
fi
