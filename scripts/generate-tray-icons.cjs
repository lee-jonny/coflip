const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const assets = path.join(__dirname, "..", "app", "assets");
const symbol = fs.readFileSync(path.join(assets, "tray-icon.svg"), "utf8");

// ImageMagick supersamples the vector for smoother diagonals at menu-bar sizes.
function render(filename, svg, size, leftInsetTrim = 0) {
  execFileSync("magick", [
    "-background", "none", "-density", "384", "svg:-",
    "-resize", `${size}x${size}`,
    ...(leftInsetTrim ? ["-chop", `${leftInsetTrim}x0+0+0`, "+repage"] : []),
    "-strip", "-define", "png:exclude-chunks=date,time",
    `PNG32:${path.join(assets, filename)}`,
  ], { input: svg });
}

render("tray-iconTemplate.png", symbol, 18, 1);
render("tray-iconTemplate@2x.png", symbol, 36, 2);

render("app-icon-cxs.png", fs.readFileSync(path.join(assets, "app-icon-cxs.svg"), "utf8"), 1024);
