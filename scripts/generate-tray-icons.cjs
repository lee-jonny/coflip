const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.join(__dirname, "..", "app", "assets");
const sourceIcon = path.join(outputDir, "tray-icon-source.png");

if (!fs.existsSync(sourceIcon)) {
  throw new Error(`Missing tray icon source: ${sourceIcon}`);
}

writeTemplateIcon(path.join(outputDir, "tray-iconTemplate.png"), 18);
writeTemplateIcon(path.join(outputDir, "tray-iconTemplate@2x.png"), 36);

function writeTemplateIcon(filePath, size) {
  execFileSync("sips", ["-z", String(size), String(size), sourceIcon, "--out", filePath], {
    stdio: "ignore",
  });
  console.log(`Wrote ${filePath}`);
}
