import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* SharePoint lists come with built-in columns, several of them read-only
   (Author = Created By, Editor = Modified By, Created, Modified, ID…).
   A Checkpoint column with one of those names cannot be written: the
   ActionUpdates list once had "Author", and every "Add update" failed with
   "Field 'Author' is read-only". No list definition may reuse one. */
const RESERVED = ['Author', 'Editor', 'Created', 'Modified', 'ID', 'Id', 'ContentType', 'ContentTypeId',
  'Attachments', 'Version', '_UIVersionString', 'LinkTitle', 'LinkTitleNoMenu', 'DocIcon', 'Edit',
  'FileRef', 'FileLeafRef', 'GUID', 'UniqueId', 'Owshiddenversion', 'AppAuthor', 'AppEditor'];

test('no Checkpoint list column reuses a SharePoint built-in column name', () => {
  const store = readFileSync('public/checkpoint/store.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...store.matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*(?:text|number|boolean|dateTime|choice|personOrGroup|hyperlinkOrPicture|currency)\s*:/g)].map((m) => m[1]);
  assert.ok(names.length > 50, 'expected to find the list column definitions');
  assert.deepEqual(names.filter((n) => RESERVED.includes(n)), []);
});

test('nothing writes the read-only Author field to an ActionUpdates row', () => {
  for (const f of ['public/checkpoint/store.js', 'public/checkpoint/azure/EvidenceSubmit/index.js']) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /[\s{,]Author:\s/, f);
  }
});
