const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'photo-sync.js'), 'utf8');

function dataUrl(type, size, byte) {
  return 'data:' + type + ';base64,' + Buffer.alloc(size, byte).toString('base64');
}

function hash(value) {
  return crypto.createHash('sha256').update(Buffer.from(value.split(',')[1], 'base64')).digest('hex');
}

function loadPhotoSync() {
  const window = {
    crypto: crypto.webcrypto,
    fetch: async () => ({
      status: 200,
      ok: true,
      clone() { return this; },
      async json() { return []; },
      async text() { return '{}'; }
    })
  };
  const context = {
    window,
    crypto: crypto.webcrypto,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    Image: class {},
    FileReader: class {},
    Uint8Array,
    Map,
    Set,
    Promise,
    console
  };
  vm.runInNewContext(source, context, {filename: 'photo-sync.js'});
  return window;
}

test('download replaces saved JPEG, PNG and WebP with small server references', async () => {
  const window = loadPhotoSync();
  const photos = [
    dataUrl('image/jpeg', 1024 * 1024, 1),
    dataUrl('image/png', 1024 * 1024, 2),
    dataUrl('image/webp', 1024 * 1024, 3)
  ];
  const entries = [{photoNote: 'Vivencia', photos, photoHashes: photos.map(hash)}];

  const result = await window.PortalPhotoSync_entriesForDownload(3489, entries);

  assert.deepEqual(JSON.parse(JSON.stringify(result[0].photos)), photos.map(photo => ({ref: hash(photo)})));
  assert.ok(JSON.stringify(result).length < 1000, 'payload must stay small enough to avoid HTTP 413');
});

test('entry hashes work immediately without waiting for the cloned fetch response', async () => {
  const window = loadPhotoSync();
  const png = dataUrl('image/png', 512 * 1024, 7);
  const result = await window.PortalPhotoSync_entriesForDownload(10790, [{photos: [png], photoHashes: [hash(png)]}]);
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].photos)), [{ref: hash(png)}]);
});

test('new unsaved photo remains inline and still passes through the requested converter', async () => {
  const window = loadPhotoSync();
  const saved = dataUrl('image/png', 64, 4);
  const unsaved = dataUrl('image/png', 64, 5);
  let conversions = 0;
  const result = await window.PortalPhotoSync_entriesForDownload(
    10805,
    [{photos: [saved, unsaved], photoHashes: [hash(saved)]}],
    async photo => { conversions += 1; return 'converted:' + photo.slice(-8); }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].photos)), [
    {ref: hash(saved)},
    'converted:' + unsaved.slice(-8)
  ]);
  assert.equal(conversions, 1);
});
