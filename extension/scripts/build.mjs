import { cpSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const targets = process.argv[2] ? [process.argv[2]] : ['chrome', 'firefox'];

execFileSync(
  process.execPath,
  [resolve('node_modules/typescript/bin/tsc'), '-b'],
  { stdio: 'inherit' },
);

for (const target of targets) {
  if (target !== 'chrome' && target !== 'firefox') {
    throw new Error(`Unsupported browser target: ${target}`);
  }

  await build({ mode: target });

  const outputDirectory = resolve(`dist-${target}`);
  mkdirSync(outputDirectory, { recursive: true });
  copyFileSync(
    resolve(`manifest.${target}.json`),
    resolve(outputDirectory, 'manifest.json'),
  );
  cpSync(resolve('icons'), resolve(outputDirectory, 'icons'), {
    recursive: true,
  });

  console.log(`Packaged ${target} extension at ${outputDirectory}`);
}
