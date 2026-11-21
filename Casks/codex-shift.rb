cask "codex-shift" do
  version "0.4.1"
  sha256 "257a5ffee0d5954d4b247555bba49da3114c39f073503d98c547380abbf6dde3"

  url "https://github.com/willofi/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
