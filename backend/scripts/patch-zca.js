import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePaths = [
  path.join(__dirname, '../node_modules/zca-js/dist/cjs/apis/getFriendOnlines.cjs'),
  path.join(__dirname, '../node_modules/zca-js/dist/apis/getFriendOnlines.js')
];

for (const filePath of filePaths) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace: const parsed = JSON.parse(online.status);
    // With: let parsed; try { parsed = JSON.parse(online.status); } catch (e) {}
    content = content.replace(
      /const parsed = JSON\.parse\(online\.status\);/g,
      'let parsed; try { parsed = JSON.parse(online.status); } catch (e) {}'
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${filePath}`);
  }
}
