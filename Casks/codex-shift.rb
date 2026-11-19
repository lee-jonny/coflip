cask "codex-shift" do
  version "0.2.3"
  sha256 "936cf24c04935097826cc7fe025636fe29be99d214d94d3536fd7610f3f467ba"

  url "https://github.com/willofi/codex-shift/releases/download/v#{version}/Codex.Shift-#{version}-arm64.dmg"
  name "Codex Shift"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/codex-shift"

  depends_on arch: :arm64
  depends_on macos: ">= :monterey"

  app "Codex Shift.app"
end
