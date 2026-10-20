import { validateSaveShape } from './engine.js';

export const HISTORY_KEY = 'ahlcg-narrator-history-v1';
export const LEGACY_KEY = 'ahlcg-narrator-save-v1';
export const emptyLibrary = () => ({ version: 1, revision: 0, activeId: null, plays: [] });

export function validateLibrary(library) {
  if (!library || library.version !== 1 || !Number.isSafeInteger(library.revision) || library.revision < 0 || !Array.isArray(library.plays)) throw Error('游戏历史数据无法读取，原始记录已保留。');
  const ids = new Set();
  if(library.deleted!==undefined&&!Array.isArray(library.deleted))throw Error('无效的已删除游戏记录。');
  for (const play of [...library.plays,...(library.deleted||[])]) {
    if (!play || typeof play.id !== 'string' || !play.id || play.id.length > 100 || ids.has(play.id) || typeof play.updatedAt !== 'string' || !Number.isFinite(Date.parse(play.updatedAt))) throw Error('游戏历史记录格式不正确，原始记录已保留。');
    ids.add(play.id);
    validateSaveShape(play.save);
  }
  if (library.activeId !== null && !library.plays.some(play=>play.id===library.activeId)) throw Error('找不到当前游戏记录。');
}
function editLibrary(storage,expected,update){
  validateLibrary(expected);
  const raw=storage.getItem(HISTORY_KEY),actual=raw===null?emptyLibrary():JSON.parse(raw);
  validateLibrary(actual);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('另一标签页已更新游戏历史，请刷新后继续。');
  const next=structuredClone(expected);update(next);next.revision++;
  validateLibrary(next);storage.setItem(HISTORY_KEY,JSON.stringify(next));return next;
}
export function deletePlay(storage,expected,id){
  return editLibrary(storage,expected,next=>{
    const play=next.plays.find(play=>play.id===id);if(!play)throw Error('找不到要删除的游戏。');
    next.deleted??=[];next.deleted.push({...play,deletedAt:new Date().toISOString()});
    next.plays=next.plays.filter(play=>play.id!==id);
    if(next.activeId===id)next.activeId=[...next.plays].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.id||null;
  });
}
export function restorePlay(storage,expected,id){
  return editLibrary(storage,expected,next=>{
    const play=next.deleted?.find(play=>play.id===id);if(!play)throw Error('找不到已删除的游戏。');
    const restored={...play};delete restored.deletedAt;
    next.deleted=next.deleted.filter(play=>play.id!==id);next.plays.push(restored);
    if(!next.activeId)next.activeId=id;
  });
}

export function readLibrary(storage) {
  const raw = storage.getItem(HISTORY_KEY);
  if (raw !== null) {
    const library = JSON.parse(raw);
    validateLibrary(library);
    return library;
  }
  const legacy = storage.getItem(LEGACY_KEY);
  if (legacy === null) return emptyLibrary();
  const save = JSON.parse(legacy);
  validateSaveShape(save);
  const id = crypto.randomUUID();
  const updatedAt = Number.isFinite(Date.parse(save.createdAt)) ? save.createdAt : new Date().toISOString();
  const library = { version: 1, revision: 1, activeId: id, plays: [{ id, updatedAt, save }] };
  storage.setItem(HISTORY_KEY, JSON.stringify(library));
  // Retain the old single-play key untouched; migration never deletes it.
  return library;
}

export function savePlay(storage, expected, save, { create = false, playId = expected.activeId, now = new Date().toISOString() } = {}) {
  validateLibrary(expected);
  validateSaveShape(save);
  const raw = storage.getItem(HISTORY_KEY);
  const actual = raw === null ? emptyLibrary() : JSON.parse(raw);
  validateLibrary(actual);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('另一标签页已更新游戏历史，请刷新后继续。');
  const next = structuredClone(expected);
  if (create) playId = crypto.randomUUID();
  const index = next.plays.findIndex(play => play.id === playId);
  if (!create && index < 0) throw Error('找不到要继续的游戏。');
  const entry = { id: playId, updatedAt: now, save: structuredClone(save) };
  if (create) next.plays.push(entry);
  else next.plays[index] = entry;
  next.activeId = playId;
  next.revision++;
  validateLibrary(next);
  // No in-memory state changes if a write fails (for example, storage quota).
  storage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
