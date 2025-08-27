import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputPath = process.argv[2] || path.join(__dirname, '..', '..', 'config', 'input-sample.txt');
const lines = fs.readFileSync(inputPath, 'utf8').trim().split('\n');
let index = 0;
setInterval(() => {
  process.stdout.write(lines[index] + '\n');
  index = (index + 1) % lines.length;
}, 10);
