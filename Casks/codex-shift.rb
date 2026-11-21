cask "codex-shift" do
  version "0.4.0"
  sha256 "0e23b151b1e4e823545c6878e351dd12a5f355937a7e071b5cf25996782eb49b"

  url "https://github.com/willofi/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/willofi/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
