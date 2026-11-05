import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const environment = path.join(project, '.build/font-tools');
const executable = path.join(
  environment,
  process.platform === 'win32' ? 'Scripts/pyftsubset.exe' : 'bin/pyftsubset',
);
const environmentPython = path.join(
  environment,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const python =
  process.env.PYTHON_BIN ??
  (process.platform === 'win32' ? 'python' : 'python3');

if (process.env.PYFTSUBSET_BIN) {
  console.log('已通过 PYFTSUBSET_BIN 指定 pyftsubset。');
} else {
  try {
    await access(executable);
    const check = spawnSync(
      environmentPython,
      ['-c', 'import fontTools, brotli'],
      { encoding: 'utf8' },
    );
    if (check.status === 0) {
      console.log('已使用缓存的 FontTools 虚拟环境。');
      process.exit(0);
    }
  } catch {
    // Create the pinned, build-only Python environment below.
  }

  const venv = spawnSync(python, ['-m', 'venv', environment], {
    stdio: 'inherit',
  });
  if (venv.status !== 0)
    throw new Error(
      '创建字体工具虚拟环境失败；请安装 Python 3 并设置 PYTHON_BIN。',
    );

  const pip = path.join(
    environment,
    process.platform === 'win32' ? 'Scripts/pip.exe' : 'bin/pip',
  );
  const install = spawnSync(
    pip,
    [
      'install',
      '--disable-pip-version-check',
      '--requirement',
      path.join(project, 'requirements-fonts.txt'),
    ],
    { stdio: 'inherit' },
  );
  if (install.status !== 0)
    throw new Error('安装固定版本的 FontTools/Brotli 失败。');
}
