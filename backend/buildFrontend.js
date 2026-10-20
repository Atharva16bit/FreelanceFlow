const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const frontendDirectory = path.join(__dirname, "..", "frontend");
const buildDirectory = path.join(frontendDirectory, "dist");
const publicDirectory = path.join(__dirname, "public");

function runNpm(args) {
  if (process.platform === "win32") {
    const command = args.join(" ");

    execFileSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `npm ${command}`],
      {
        cwd: frontendDirectory,
        stdio: "inherit",
      },
    );

    return;
  }

  execFileSync("npm", args, {
    cwd: frontendDirectory,
    stdio: "inherit",
  });
}

try {
  runNpm(["ci"]);
  runNpm(["run", "build"]);

  if (!fs.existsSync(path.join(buildDirectory, "index.html"))) {
    throw new Error("Frontend build did not produce index.html.");
  }

  fs.rmSync(publicDirectory, { recursive: true, force: true });
  fs.cpSync(buildDirectory, publicDirectory, { recursive: true });

  console.log("Frontend copied to backend/public successfully.");
} catch (error) {
  console.error("Frontend build failed:", error.message);
  process.exitCode = 1;
}
