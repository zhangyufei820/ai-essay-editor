#!/usr/bin/env node

const { install, runServer, setup } = require("../src/main");

const command = process.argv[2] || "serve";

if (command === "install") {
  install().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else if (command === "setup") {
  setup().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else if (command === "serve") {
  runServer();
} else {
  console.error("用法：xingren-image-mcp [install|setup]");
  process.exitCode = 1;
}
