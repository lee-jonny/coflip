cask "codex-shift" do
  version "0.4.2"
  sha256 "e1112e9a635b38d8d1f81e5d6381c106bba923aceb20a0bb76e98cd1e9281d1c"

  url "https://github.com/willofi/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
