import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDir = path.join(project, '.build/fonts');
const fontPath = path.join(outputDir, 'ZhuqueFangsong-Regular.ttf');
const url =
  'https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip';
const expectedSha256 =
  'bb8b661a7643d2296a72d9d10530a00949419c4e527fb61783f73c2ba1a8c062';

try {
  await access(fontPath);
  console.log(`已使用缓存的朱雀仿宋字体：${fontPath}`);
} catch {
  if (process.env.TYPST_FONT_PATH) {
    console.log('已设置 TYPST_FONT_PATH；跳过项目默认字体下载。');
  } else {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`下载朱雀仿宋失败：HTTP ${response.status}`);
    const archive = new Uint8Array(await response.arrayBuffer());
    const digest = createHash('sha256').update(archive).digest('hex');
    if (digest !== expectedSha256)
      throw new Error(`朱雀仿宋归档 SHA-256 不匹配：${digest}`);
    const contents = unzipSync(archive);
    const font = contents['ZhuqueFangsong-Regular.ttf'];
    if (!font) throw new Error('朱雀仿宋归档中缺少 ZhuqueFangsong-Regular.ttf');
    await mkdir(outputDir, { recursive: true });
    await writeFile(fontPath, font);
    console.log(
      `字体已缓存到 ${fontPath}（OFL-1.1；发布产物只包含 Typst 输出的字形路径）。`,
    );
  }
}
