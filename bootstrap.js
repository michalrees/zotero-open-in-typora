const { classes: Cc, interfaces: Ci } = Components;
const ID = 'open-notes-in-typora@local';
const PREFIX = 'extensions.openNotesInTypora.';
let menuID, timer, busy = false, stopped = false;
const managed = new Set();
const pref = (name, fallback) => Zotero.Prefs.get(PREFIX + name, true) || fallback;
const hash = value => Zotero.Utilities.Internal.md5(value, false);
function clean(value, limit = 170) {
  let result = String(value || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  while (new TextEncoder().encode(result).length > limit) result = Array.from(result).slice(0, -1).join('');
  return result.replace(/[. ]+$/, '') || 'Untitled';
}
function eligible(items) {
  return items?.length === 1 && items[0].isNote() && !!items[0].parentItemID && !items[0].deleted;
}
function engine() {
  const bn = Zotero.BetterNotes;
  if (!bn?.api?.sync?.getSyncStatus || !bn?.api?.$export?.saveMD || !bn?.hooks?.onSyncing) {
    throw new Error('请先安装并启用 Better Notes，等待其初始化完成后重试。');
  }
  return bn;
}
function notify(error) {
  Zotero.logError(error);
  Services.prompt.alert(Zotero.getMainWindow(), '用 Typora 打开', error.message || String(error));
}
function remember(id) {
  managed.add(id);
  Zotero.Prefs.set(PREFIX + 'managedNoteIDs', JSON.stringify([...managed]), true);
}
async function synchronize(bn, note, skipActive = false) {
  if (bn.data?.sync?.lock) throw new Error('Better Notes 正在同步，请稍后重试。');
  await bn.hooks.onSyncing([note], { quiet: true, skipActive, reason: 'typora' });
}
async function verifySynced(bn, note, path) {
  const status = bn.api.sync.getSyncStatus(note.id);
  const md = await bn.api.sync.getMDStatus(path);
  if (hash(md.content) !== status.md5 || hash(note.getNote()) !== status.noteMd5) {
    throw new Error('这篇笔记还有未解决的同步差异。请先在 Better Notes 中完成合并，再用 Typora 打开。');
  }
}
async function ensureFile(note) {
  const bn = engine();
  let status = bn.api.sync.getSyncStatus(note.id);
  if (status.path && status.filename) {
    const existing = PathUtils.join(status.path, status.filename);
    if (await IOUtils.exists(existing)) {
      await synchronize(bn, note);
      await verifySynced(bn, note, existing);
      return existing;
    }
    throw new Error('已登记的同步文件不在原位置，请先在 Better Notes 修复文件路径：\n' + existing);
  }
  const parent = await Zotero.Items.getAsync(note.parentItemID);
  if (!parent?.isRegularItem() || parent.deleted) throw new Error('父条目不可用。');
  const home = Services.dirsvc.get('Home', Ci.nsIFile).path;
  const root = pref('root', PathUtils.join(home, 'local', 'Yu', 'Paper'));
  const year = parent.getField('date').match(/\d{4}/)?.[0] || '';
  const author = parent.getCreators()[0]?.lastName || '';
  const folder = clean([year, author, parent.getField('title')].filter(Boolean).join(' - '), 200) + ' [' + parent.key + ']';
  const directory = PathUtils.join(root, folder);
  await IOUtils.makeDirectory(directory, { ignoreExisting: true, createAncestors: true });
  const discovered = await bn.api.sync.getMDFileName(note.id, directory);
  let filename = clean(note.getNoteTitle()) + '-' + note.key + '.md';
  if (await IOUtils.exists(PathUtils.join(directory, discovered))) filename = discovered;
  const path = PathUtils.join(directory, filename);
  if (await IOUtils.exists(path)) {
    const md = await bn.api.sync.getMDStatus(path);
    const expected = await bn.api.convert.note2md(note, directory, { keepNoteLink: false, withYAMLHeader: true });
    if (md.content !== bn.api.sync.getMDStatusFromContent(expected).content) {
      throw new Error('目录中已有内容不同的笔记，已保留原文件。请通过 Better Notes 关联并合并：\n' + path);
    }
  } else {
    await bn.api.$export.saveMD(path, note.id, { keepNoteLink: false, withYAMLHeader: true });
  }
  const md = await bn.api.sync.getMDStatus(path);
  if (!await IOUtils.exists(path)) throw new Error('笔记导出失败：' + path);
  bn.api.sync.updateSyncStatus(note.id, {
    path: directory, filename, itemID: note.id, md5: hash(md.content),
    noteMd5: hash(note.getNote()), lastsync: Date.now()
  });
  return path;
}
function launch(path) {
  const executable = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  executable.initWithPath(pref('executable', '/opt/typora/Typora'));
  if (!executable.exists() || !executable.isExecutable()) throw new Error('找不到 Typora 程序：' + executable.path);
  const process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
  process.init(executable);
  // Pass the file as an argument, never as shell code.
  process.runwAsync([path], 1, { observe(subject, topic) {
    if (topic === 'process-failed' || (topic === 'process-finished' && process.exitValue !== 0)) {
      notify(new Error('Typora 启动失败，请检查本地 Typora 是否可以正常运行。'));
    }
  } });
}
async function openNote(note) {
  if (busy) return;
  busy = true;
  try {
    if (!eligible([note])) throw new Error('请选择一篇条目下的子笔记。');
    const file = await ensureFile(note);
    if (stopped) return;
    remember(note.id);
    launch(file);
  } finally { busy = false; }
}
async function tick() {
  if (busy || stopped || !managed.size) return;
  const bn = Zotero.BetterNotes;
  if (!bn?.hooks?.onSyncing || bn.data?.sync?.lock) return;
  busy = true;
  try {
    const notes = (await Zotero.Items.getAsync([...managed])).filter(n => n?.isNote() && !n.deleted && bn.api.sync.isSyncNote(n.id));
    if (notes.length) await bn.hooks.onSyncing(notes, { quiet: true, skipActive: true, reason: 'typora-background' });
  } catch (error) { Zotero.logError(error); }
  finally { busy = false; }
}
async function startup() {
  stopped = false;
  try {
    for (const id of JSON.parse(pref('managedNoteIDs', '[]'))) if (Number.isInteger(id)) managed.add(id);
  } catch (error) { Zotero.logError(error); }
  menuID = Zotero.MenuManager.registerMenu({
    menuID: 'open-note-in-typora', pluginID: ID, target: 'main/library/item',
    menus: [{ menuType: 'menuitem',
      onShowing(event, context) {
        context.menuElem.setAttribute('label', '用 Typora 打开');
        context.setVisible(eligible(context.items));
        context.setEnabled(!busy);
      },
      onCommand(event, context) { openNote(context.items[0]).catch(notify); }
    }]
  });
  if (!menuID) throw new Error('无法注册 Typora 右键菜单');
  timer = setInterval(tick, 5000);
}
function shutdown() {
  stopped = true;
  if (timer) clearInterval(timer);
  if (menuID) Zotero.MenuManager.unregisterMenu(menuID);
  timer = menuID = null;
}
function install() {}
function uninstall() {}
