#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = __dirname;
const jsonPath = path.join(root, 'hexabot-config.json');
const jsPath = path.join(root, 'hexabot-config.js');

function main() {
  let raw;
  try {
    raw = fs.readFileSync(jsonPath, 'utf8');
  } catch (e) {
    console.error(`Cannot read ${path.basename(jsonPath)}: ${e.message}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${path.basename(jsonPath)}: ${e.message}`);
    process.exit(1);
  }

  const serialized = JSON.stringify(config, null, 2);
  const output = [
    '// AUTO-GENERATED FILE. Do not edit directly.',
    '// Edit hexabot-config.json, then run: node sync-config.js',
    '',
    `window.HexabotRobotConfig = ${serialized};`,
    ''
  ].join('\n');

  try {
    fs.writeFileSync(jsPath, output, 'utf8');
  } catch (e) {
    console.error(`Cannot write ${path.basename(jsPath)}: ${e.message}`);
    process.exit(1);
  }

  console.log(`Generated ${path.basename(jsPath)} from ${path.basename(jsonPath)}`);
}

main();
