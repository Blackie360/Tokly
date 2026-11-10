# Homebrew cask for Tokly clipboard history. This file belongs in a public tap
# repository as Casks/tokly.rb (for example Blackie360/homebrew-tokly, which gives
# `brew install --cask blackie360/tokly/tokly`).
#
# Before publishing:
#   1. The zip must be downloadable without signing in. Releases of the private
#      Tokly repository are not, so upload the zip to a public place (the tap
#      repository's own releases work) and point `url` at it.
#   2. Replace `sha256` with the value from the release's .sha256 file.
#   3. Ship a Developer ID signed and notarized build; Homebrew quarantines casks
#      and macOS refuses to open unsigned ones.
cask "tokly" do
  version "0.1.0"
  sha256 "REPLACE_WITH_THE_SHA256_OF_THE_ZIP"

  url "https://github.com/Blackie360/homebrew-tokly/releases/download/v#{version}/Tokly-#{version}-universal.zip"
  name "Tokly"
  desc "Clipboard history for the menu bar"
  homepage "https://tokly.blackielabs.com/"

  depends_on macos: ">= :monterey"

  app "Tokly.app"

  uninstall quit: "com.blackielabs.tokly.clipboard"

  zap trash: [
    "~/Library/Application Support/com.blackielabs.tokly.clipboard",
    "~/Library/Caches/com.blackielabs.tokly.clipboard",
    "~/Library/WebKit/com.blackielabs.tokly.clipboard",
  ]
end
