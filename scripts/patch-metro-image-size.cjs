/*
 * Runtime mitigation for GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq in
 * Metro's image-size dependency. BikerLink does not need ICNS, HEIF or JXL.
 *
 * npm audit may continue to report image-size@1.2.1 because this postinstall
 * patch does not change the lockfile version. Treat the findings as mitigated
 * runtime exposure, not as false positives or as a replacement for upgrading
 * when Metro publishes a compatible fixed dependency.
 */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const metroRoot = path.join(projectRoot, 'node_modules', 'metro');
let imageSizePackage;

try {
  imageSizePackage = require.resolve('image-size/package.json', { paths: [metroRoot] });
} catch {
  throw new Error('Metro image-size dependency not found; refusing to apply an unverified security patch.');
}

const imageSizeRoot = path.dirname(imageSizePackage);
const imageSizeMeta = JSON.parse(fs.readFileSync(imageSizePackage, 'utf8'));

if (imageSizeMeta.name !== 'image-size' || imageSizeMeta.version !== '1.2.1') {
  throw new Error(`Expected Metro image-size@1.2.1, found ${imageSizeMeta.name}@${imageSizeMeta.version}. Review this patch before continuing.`);
}

const typesIndex = path.join(imageSizeRoot, 'dist', 'types', 'index.js');
const detector = path.join(imageSizeRoot, 'dist', 'detector.js');

function replaceExactly(file, replacements) {
  let source = fs.readFileSync(file, 'utf8');
  for (const [before, after] of replacements) {
    if (source.includes(after) && !source.includes(before)) continue;
    if (!source.includes(before)) throw new Error(`Expected source fragment missing in ${file}: ${before.trim()}`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(file, source);
}

replaceExactly(typesIndex, [
  ["const heif_1 = require(\"./heif\");\n", ''],
  ["const icns_1 = require(\"./icns\");\n", ''],
  ["const jxl_1 = require(\"./jxl\");\n", ''],
  ["const jxl_stream_1 = require(\"./jxl-stream\");\n", ''],
  ['    heif: heif_1.HEIF,\n', ''],
  ['    icns: icns_1.ICNS,\n', ''],
  ['    jxl: jxl_1.JXL,\n', ''],
  ["    'jxl-stream': jxl_stream_1.JXLStream,\n", ''],
]);

replaceExactly(detector, [["    0x69: 'icns',\n", '']]);

console.log('Applied Metro image-size security mitigation: ICNS, HEIF and JXL parsers disabled.');
