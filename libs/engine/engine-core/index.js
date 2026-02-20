/* eslint-disable */
/* auto-generated napi binding loader */
const { join } = require('path');

const platformArchMap = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x86_64',
  'linux-x64': 'linux-x86_64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
};

const triple = platformArchMap[`${process.platform}-${process.arch}`];
if (!triple) {
  throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
}

module.exports = require(join(__dirname, `engine-core.${triple}.node`));
