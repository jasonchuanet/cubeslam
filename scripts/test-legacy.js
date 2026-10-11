"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
// Original tests use console.assert, which Node normally only logs. Make each
// assertion fail the process so the test command has a meaningful exit status.
for (const file of ["buffer", "inputs-buffer", "hash-code", "see", "tick"]) {
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      path.resolve(__dirname, "test-bootstrap.js"),
      "-e",
      "console.assert = require('node:assert').ok; require(" +
        JSON.stringify(path.resolve(__dirname, "../test/" + file + ".js")) +
        ");",
    ],
    { stdio: "inherit", timeout: 20000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  console.log("Passed legacy " + file);
}
