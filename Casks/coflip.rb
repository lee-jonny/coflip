cask "coflip" do
  version "0.4.4"
  sha256 "bde7d07ae58120103bc19fed1c52c38221ccd6baf4badae35abc9d71901b9a41"

  url "https://github.com/lee-jonny/coflip/releases/download/v#{version}/CoFlip-#{version}-arm64.dmg"
  name "CoFlip"
  desc "Menu bar app for switching Codex account contexts"
  homepage "https://github.com/lee-jonny/coflip"

  depends_on arch: :arm64
  depends_on macos: :monterey

  app "CoFlip.app"
end
