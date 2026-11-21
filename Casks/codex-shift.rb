cask "codex-shift" do
  version "0.4.3"
  sha256 "46ffe5d45dcf1871229bf95fb01603d8de9c1bfd628722fdcebf03be0b1a1e4d"

  url "https://github.com/lee-jonny/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/lee-jonny/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
