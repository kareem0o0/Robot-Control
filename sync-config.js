#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = __dirname;
const jsonPath = path.join(root, 'hexabot-config.json');
const jsPath = path.join(root, 'hexabot-config.js');

function main() {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const config = JSON.parse(raw);
  const serialized = JSON.stringify(config, null, 2);
  const output = [
    '// AUTO-GENERATED FILE. Do not edit directly.',
    '// Edit hexabot-config.json, then run: node sync-config.js',
    '',
    `window.HexabotRobotConfig = ${serialized};`,
    ''
  ].join('\n');

  fs.writeFileSync(jsPath, output, 'utf8');
  console.log(`Generated ${path.basename(jsPath)} from ${path.basename(jsonPath)}`);
}

main();
