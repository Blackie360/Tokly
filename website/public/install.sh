#!/bin/sh
# Tokly installer for Linux (Debian, Ubuntu and relatives, 64-bit).
#
#   curl -fsSL https://tokly.blackielabs.com/install.sh | sh
#
# Downloads the newest Tokly .deb from GitHub, checks its SHA-256 and installs it
# with apt. Read it before you run it: https://tokly.blackielabs.com/install.sh
set -eu

REPO="Blackie360/Tokly"
API="https://api.github.com/repos/$REPO/releases?per_page=20"

say() { printf '%s\n' "$*"; }
fail() { printf 'tokly: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || fail "this installer is for Linux. See https://tokly.blackielabs.com/ for other systems."
case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) fail "only 64-bit Intel/AMD (x86_64) builds exist so far; this machine is $(uname -m)." ;;
esac
command -v dpkg >/dev/null 2>&1 || fail "this installer needs a Debian-based system (dpkg not found). Other distributions are not packaged yet."
command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required."

say "Looking up the newest Tokly release..."
# The first .deb listed belongs to the newest release that has one.
url=$(curl -fsSL -H "Accept: application/vnd.github+json" "$API" |
  grep -o '"browser_download_url": *"[^"]*linux-amd64\.deb"' | head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/')
[ -n "$url" ] || fail "no Linux release found at https://github.com/$REPO/releases"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
file="$work/$(basename "$url")"

say "Downloading $(basename "$url")..."
curl -fL --progress-bar -o "$file" "$url"
curl -fsSL -o "$file.sha256" "$url.sha256" || fail "could not download the checksum."

expected=$(cut -d ' ' -f 1 "$file.sha256")
actual=$(sha256sum "$file" | cut -d ' ' -f 1)
[ "$expected" = "$actual" ] || fail "checksum mismatch; the download was not installed."
say "Checksum verified."

if [ "$(id -u)" -eq 0 ]; then
  sudo=""
else
  command -v sudo >/dev/null 2>&1 || fail "run this as root, or install sudo."
  sudo="sudo"
  say "Installing needs administrator rights; sudo may ask for your password."
fi

if command -v apt-get >/dev/null 2>&1; then
  $sudo apt-get install -y "$file"
else
  $sudo dpkg -i "$file"
fi

say ""
say "Tokly is installed. Start it from your applications menu, or run: tokly"
say "It lives in the system tray; Alt+Shift+C opens the history."
say "To remove it later: sudo apt-get remove tokly"
