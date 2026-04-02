const { ReplitConnectors } = require('@replit/connectors-sdk');
const fs = require('fs');
const path = require('path');

const FILES = [
  { name: 'bikerlink-manual.pdf', path: path.join(__dirname, '..', 'server', 'public', 'bikerlink-manual.pdf') },
  { name: 'bikerlink-manuale-aprile2026.pdf', path: path.join(__dirname, '..', 'manuale-utente-bikerlink-aprile2026.pdf') },
  { name: 'bikerlink-eula.pdf', path: path.join(__dirname, '..', 'server', 'public', 'bikerlink-eula.pdf') },
  { name: 'bikerlink-privacy-policy.pdf', path: path.join(__dirname, '..', 'server', 'public', 'bikerlink-privacy-policy.pdf') },
];

const FOLDER_NAME = 'BikerLink — Documenti Legali';

async function main() {
  const connectors = new ReplitConnectors();

  console.log('Step 1: Searching for existing folder...');
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchParams = new URLSearchParams({ q, fields: 'files(id,name)' });
  const searchRes = await connectors.proxy('google-drive', `/drive/v3/files?${searchParams.toString()}`, {
    method: 'GET',
  });
  const searchData = await searchRes.json();
  console.log('Search result:', JSON.stringify(searchData));

  let folderId;
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
    console.log(`Found existing folder: ${folderId}`);
  } else {
    console.log('Step 2: Creating folder...');
    const createRes = await connectors.proxy('google-drive', '/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const createData = await createRes.json();
    console.log('Folder created:', JSON.stringify(createData));
    folderId = createData.id;
  }

  if (!folderId) {
    throw new Error('Could not get or create folder');
  }

  console.log(`Using folder ID: ${folderId}`);

  for (const file of FILES) {
    console.log(`\nUploading ${file.name}...`);

    const fileContent = fs.readFileSync(file.path);
    const fileSize = fileContent.length;

    const boundary = 'boundary_bikerlink_upload';
    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: file.name, parents: [folderId] })}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const endPart = `\r\n--${boundary}--`;

    const metaBuffer = Buffer.from(metaPart, 'utf8');
    const filePartBuffer = Buffer.from(filePart, 'utf8');
    const endBuffer = Buffer.from(endPart, 'utf8');

    const multipart = Buffer.concat([metaBuffer, filePartBuffer, fileContent, endBuffer]);

    const uploadRes = await connectors.proxy('google-drive', '/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipart.length.toString(),
      },
      body: multipart,
    });

    const uploadData = await uploadRes.json();
    console.log(`Uploaded ${file.name}:`, JSON.stringify(uploadData));
  }

  console.log('\nAll files uploaded successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
