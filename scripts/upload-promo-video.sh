#!/bin/bash
# Upload del video promozionale BikerLink su Object Storage
# Uso: bash scripts/upload-promo-video.sh [path_to_video]
# Default: attached_assets/generated_videos/bikerlink_promo_final.mp4

VIDEO_FILE="${1:-attached_assets/generated_videos/bikerlink_promo_final.mp4}"
OBJECT_KEY="public/playstore/bikerlink_promo_video.mp4"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ File non trovato: $VIDEO_FILE"
  exit 1
fi

echo "📹 Upload video promozionale su Object Storage..."
echo "   Source: $VIDEO_FILE"
echo "   Target: $OBJECT_KEY"

export VIDEO_FILE OBJECT_KEY
node << 'NODEEOF'
const { Client } = require('@replit/object-storage');
const fs = require('fs');

async function upload() {
  const client = new Client();
  const filePath = process.env.VIDEO_FILE;
  const objectKey = process.env.OBJECT_KEY;

  const buffer = fs.readFileSync(filePath);
  console.log('   Size: ' + (buffer.length / 1024 / 1024).toFixed(1) + ' MB');

  const result = await client.uploadFromBytes(objectKey, buffer, {
    headers: { 'Content-Type': 'video/mp4' },
  });

  if (result.ok) {
    const domain = process.env.REPLIT_DEV_DOMAIN || 'biker-link.net';
    console.log('Upload completato!');
    console.log('');
    console.log('URL pubblica (backend):');
    console.log('  https://' + domain + '/api/media/promo-video');
    console.log('');
    console.log('Object Storage path: ' + objectKey);
  } else {
    console.error('Upload fallito:', result.error?.message);
    process.exit(1);
  }
}

upload().catch(e => { console.error(e.message); process.exit(1); });
NODEEOF
