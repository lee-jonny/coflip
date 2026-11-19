const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const assets = path.join(__dirname, "..", "app", "assets");
const symbol = fs.readFileSync(path.join(assets, "tray-icon.svg"), "utf8");

// ImageMagick supersamples the vector for smoother diagonals at menu-bar sizes.
function render(filename, svg, size) {
  execFileSync("magick", [
    "-background", "none", "-density", "384", "svg:-",
    "-resize", `${size}x${size}`, "-strip", "-define", "png:exclude-chunks=date,time",
    `PNG32:${path.join(assets, filename)}`,
  ], { input: svg });
}

render("tray-iconTemplate.png", symbol, 18);
render("tray-iconTemplate@2x.png", symbol, 36);

const appSymbol = symbol
  .replace(/<svg[^>]*>/, '<g transform="translate(242 242) scale(30)">')
  .replace("</svg>", "</g>")
  .replace('id="forward"', 'fill="#F3F6F5"')
  .replace('id="back"', 'fill="#78E4CC"');
render("app-icon-cxs.png", `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect x="100" y="106" width="824" height="824" rx="188" fill="#101D26" opacity=".13"/>
    <rect x="100" y="98" width="824" height="824" rx="188" fill="#1B2935"/>
    ${appSymbol}
  </svg>`, 1024);
