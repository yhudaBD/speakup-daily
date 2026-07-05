import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svg = readFileSync(join(publicDir, "icon.svg"));

const outputs = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "favicon-32.png", size: 32 },
];

for (const { file, size } of outputs) {
  await sharp(svg).resize(size, size).png().toFile(join(publicDir, file));
  console.log(`Created ${file} (${size}x${size})`);
}
