const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function afterPack(context) {
  if (process.platform !== "darwin" || context.electronPlatformName !== "darwin") {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  try {
    execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
      stdio: "ignore",
    });
    return;
  } catch {
    // The unsigned Electron bundle can open locally but fails Gatekeeper after download.
  }

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
