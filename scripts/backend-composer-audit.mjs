import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const backendPath = path.join(root, 'backend');
const localComposer = path.join(root, '.tools', 'composer.phar');
const localPhp = path.join(root, '.tools', 'php', 'php.exe');
const useLocalComposer = fs.existsSync(localComposer) && fs.existsSync(localPhp);

const executable = useLocalComposer
  ? localPhp
  : process.env.COMPOSER_BINARY || (process.platform === 'win32' ? 'composer.bat' : 'composer');

const args = useLocalComposer
  ? [localComposer, 'audit', '--locked']
  : ['audit', '--locked'];

const result = spawnSync(executable, args, {
  cwd: backendPath,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
