const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(__dirname + '/bootstrap.js', 'utf8');
function fixture() {
  const files = new Map(), statuses = new Map(), prefs = new Map();
  let registered, exported = 0, synced = 0;
  const note = { id: 1, key: 'NOTE1234', parentItemID: 2, isNote: () => true, getNote: () => 'content', getNoteTitle: () => '测试笔记' };
  const parent = { key: 'PAPER123', isRegularItem: () => true, getField: f => f === 'date' ? '2026' : 'Paper / title', getCreators: () => [{ lastName: 'Gu' }] };
  const hash = s => require('node:crypto').createHash('md5').update(s).digest('hex');
  const bn = { data: { sync: { lock: false } }, api: {
    sync: {
      getSyncStatus: id => statuses.get(id) || {}, isSyncNote: id => statuses.has(id),
      getMDFileName: async () => 'generated-NOTE1234.md',
      getMDStatus: async p => ({ content: files.get(p) }),
      getMDStatusFromContent: s => ({ content: s }), updateSyncStatus: (id,s) => statuses.set(id,s)
    },
    convert: { note2md: async n => n.getNote() },
    $export: { saveMD: async p => { exported++; files.set(p, note.getNote()); } }
  }, hooks: { onSyncing: async () => { synced++; } } };
  const context = vm.createContext({ Components: { classes: {}, interfaces: {} }, TextEncoder,
    PathUtils: { join: path.join }, IOUtils: { exists: async p => files.has(p), makeDirectory: async () => {} },
    setInterval: () => 1, clearInterval() {}, Services: { dirsvc: { get: () => ({ path: '/home/test-user' }) } },
    Zotero: { BetterNotes: bn, Prefs: { get: k => prefs.get(k), set: (k,v) => prefs.set(k,v) },
      Utilities: { Internal: { md5: hash } }, logError() {},
      Items: { getAsync: async id => Array.isArray(id) ? id.map(() => note) : parent },
      MenuManager: { registerMenu: o => { registered=o; return o.menuID; }, unregisterMenu() {} }
    }
  });
  vm.runInContext(source, context);
  return { context, note, files, statuses, bn, hash, counts: () => ({exported,synced}), menu: () => registered };
}
test('new note creates one Markdown and registers matching hashes', async () => {
  const f=fixture(); const p=await f.context.ensureFile(f.note);
  assert.match(p, /2026 - Gu - Paper - title \[PAPER123\]/);
  assert.equal(f.files.get(p),'content'); assert.equal(f.statuses.get(1).md5,f.hash('content'));
  await f.context.ensureFile(f.note); assert.equal(f.counts().exported,1);
});
test('existing synced file is reused and external modifications are never overwritten', async () => {
  const f=fixture(); const p=await f.context.ensureFile(f.note);
  f.files.set(p,'external edit');
  await assert.rejects(f.context.ensureFile(f.note),/同步差异/);
  assert.equal(f.files.get(p),'external edit'); assert.equal(f.counts().exported,1);
});
test('missing registered file is reported instead of silently recreated', async () => {
  const f=fixture(); const p=await f.context.ensureFile(f.note); f.files.delete(p);
  await assert.rejects(f.context.ensureFile(f.note),/原位置/); assert.equal(f.counts().exported,1);
});
test('unregistered existing file is recovered only if content matches', async () => {
  const f=fixture(); const p='/home/test-user/local/Yu/Paper/2026 - Gu - Paper - title [PAPER123]/generated-NOTE1234.md';
  f.files.set(p,'different'); await assert.rejects(f.context.ensureFile(f.note),/内容不同/);
  assert.equal(f.counts().exported,0); f.files.set(p,'content');
  assert.equal(await f.context.ensureFile(f.note),p); assert.equal(f.counts().exported,0);
});
test('menu appears only for a single child note; background sync works without window focus', async () => {
  const f=fixture(); await f.context.startup(); let visible;
  const c={items:[f.note], menuElem:{setAttribute(){}},setVisible:v=>visible=v,setEnabled(){}};
  f.menu().menus[0].onShowing(null,c); assert.equal(visible,true);
  c.items=[]; f.menu().menus[0].onShowing(null,c); assert.equal(!!visible,false);
  await f.context.ensureFile(f.note); f.context.remember(1); await f.context.tick();
  assert.equal(f.counts().synced,1); f.context.shutdown();
});
test('missing Better Notes and concurrent sync are actionable failures', async () => {
  const f=fixture(); f.bn.data.sync.lock=true;
  await assert.rejects(f.context.synchronize(f.bn,f.note),/正在同步/);
  f.context.Zotero.BetterNotes=null;
  await assert.rejects(f.context.ensureFile(f.note),/Better Notes/);
});
