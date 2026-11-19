cask "codex-shift" do
  version "0.2.4"
  sha256 "6b000d5d13f77b49d69e4daa4b784d78240f2620b224e0175b399e201185cbfd"

  url "https://github.com/willofi/codex-shift/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/codex-shift"

  depends_on arch: :arm64
  depends_on macos: ">= :monterey"

  app "CoFlip.app"
end
