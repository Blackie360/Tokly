# Candidate cask template, not a published/usable cask.
# The public tap is https://github.com/Blackie360/homebrew-tokly.
# Generate the live cask with that tap's scripts/prepare-cask.sh after a signed,
# notarized public Tokly release and all real-device release checks are complete.
# Never publish the placeholder checksum or remove Homebrew quarantine.
cask "tokly" do
  version "0.1.0"
  sha256 "REPLACE_WITH_THE_SHA256_OF_THE_ZIP"

  url "https://github.com/Blackie360/Tokly/releases/download/clipboard-v#{version}/Tokly-#{version}-macos-universal.zip"
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
