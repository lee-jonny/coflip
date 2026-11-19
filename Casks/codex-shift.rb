cask "codex-shift" do
  version "0.3.0"
  sha256 "2dd369ac4a77aea7a5bef0be5f0a2341f304139ffd89f0d8bab1bcfdae80e352"

  url "https://github.com/willofi/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
