import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSave, commit, replay } from '../src/engine.js';
import { HISTORY_KEY, LEGACY_KEY, emptyLibrary, readLibrary, savePlay, deletePlay, restorePlay } from '../src/library.js';
import { renderMainMenu, renderNewPlayForm } from '../src/menu.js';
const db = JSON.parse(await readFile(new URL('../data/dwl.json',import.meta.url)));
function storage() {
  const values = new Map();
  return { getItem:key=>values.has(key)?values.get(key):null, setItem:(key,value)=>values.set(key,String(value)) };
}
const fresh = name => createSave([{name}],name);
const ui = { L:(zh)=>zh, t:value=>db.translations['zh-cn'][value]||value, escape:String, locale:'zh-cn', button:(label,action,attrs='')=>`<button data-action="${action}" ${attrs}>${label}</button>` };
test('creating two games preserves the first and stores separate IDs',()=>{
  const store=storage();let library=readLibrary(store);
  library=savePlay(store,library,fresh('甲'),{create:true});const first=library.activeId;
  library=savePlay(store,library,fresh('乙'),{create:true});
  assert.equal(library.plays.length,2);assert.notEqual(library.activeId,first);
  assert.equal(readLibrary(store).plays.find(play=>play.id===first).save.investigators[0].name,'甲');
});
test('resuming and updating a historical game does not modify the other game',()=>{
  const store=storage();let library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true});const first=library.activeId;
  library=savePlay(store,library,fresh('乙'),{create:true});const second=library.activeId;
  const unchanged=structuredClone(library.plays.find(play=>play.id===second));
  const save=commit(db,library.plays.find(play=>play.id===first).save,{type:'adjust',investigator:'i1',field:'earned',delta:3});
  library=savePlay(store,library,save,{playId:first});
  assert.equal(library.activeId,first);
  assert.equal(replay(db,readLibrary(store).plays.find(play=>play.id===first).save).investigators[0].earned,3);
  assert.deepEqual(library.plays.find(play=>play.id===second),unchanged);
});
test('old single-game save migrates once and its raw data is retained',()=>{
  const store=storage(), original=JSON.stringify(fresh('旧游戏'));store.setItem(LEGACY_KEY,original);
  const library=readLibrary(store);
  assert.equal(library.plays.length,1);assert.equal(store.getItem(LEGACY_KEY),original);
  assert.deepEqual(readLibrary(store),library);
  const updated=savePlay(store,library,fresh('新游戏'),{create:true});
  assert.equal(updated.plays.length,2);assert.equal(store.getItem(LEGACY_KEY),original);
});
test('corrupt history is never overwritten or replaced by legacy data',()=>{
  const store=storage();store.setItem(HISTORY_KEY,'broken-json');store.setItem(LEGACY_KEY,JSON.stringify(fresh('旧游戏')));
  assert.throws(()=>readLibrary(store));assert.equal(store.getItem(HISTORY_KEY),'broken-json');
});
test('outdated tabs cannot overwrite a newer history list',()=>{
  const store=storage(), first=emptyLibrary();const current=savePlay(store,first,fresh('甲'),{create:true});
  assert.throws(()=>savePlay(store,first,fresh('乙'),{create:true}),/另一标签页/);
  assert.deepEqual(readLibrary(store),current);
});
test('failed writes leave both the library and existing game untouched',()=>{
  const store=storage(), library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true});const previous=structuredClone(library);
  const originalWrite=store.setItem;store.setItem=()=>{throw Error('quota')};
  assert.throws(()=>savePlay(store,library,fresh('乙'),{create:true}),/quota/);
  assert.deepEqual(library,previous);store.setItem=originalWrite;assert.deepEqual(readLibrary(store),previous);
});
test('main menu provides new-game and per-game continue/delete actions',()=>{
  const store=storage();let library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true,now:'2026-10-19T10:00:00Z'});
  library=savePlay(store,library,fresh('乙'),{create:true,now:'2026-10-20T10:00:00Z'});
  const html=renderMainMenu(db,library,ui);
  assert.equal((html.match(/data-action="new"/g)||[]).length,1);
  assert.equal((html.match(/data-action="resume-play"/g)||[]).length,2);
  assert.equal((html.match(/data-action="delete-play"/g)||[]).length,2);
  assert.ok(html.indexOf('乙')<html.indexOf('甲'));
  for(const text of ['每个选择','跟随你的选择','卡牌就在手边','内容准备进度','备份','data-action="import"','data-action="export"'])assert.ok(!html.includes(text));
});
test('delete removes only the chosen game and can restore its complete saved state',()=>{
  const store=storage();let library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true});const first=library.activeId;
  library=savePlay(store,library,fresh('乙'),{create:true});const second=library.activeId;
  const original=structuredClone(library.plays.find(play=>play.id===second));
  library=deletePlay(store,library,second);
  assert.deepEqual(library.plays.map(play=>play.id),[first]);assert.equal(library.activeId,first);
  assert.equal(readLibrary(store).deleted[0].id,second);
  const html=renderMainMenu(db,library,ui);assert.ok(html.includes('撤销上次删除'));assert.ok(!html.includes('data-action="resume-play" data-id="'+second+'"'));
  library=restorePlay(store,readLibrary(store),second);
  assert.deepEqual(library.plays.find(play=>play.id===second),original);
  assert.equal(library.deleted.length,0);
});
test('deleting an inactive game keeps the current game selected',()=>{
  const store=storage();let library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true});const first=library.activeId;
  library=savePlay(store,library,fresh('乙'),{create:true});const active=library.activeId;
  library=deletePlay(store,library,first);assert.equal(library.activeId,active);
});
test('deleting the last game does not resurrect the old single-play record on refresh',()=>{
  const store=storage();store.setItem(LEGACY_KEY,JSON.stringify(fresh('旧游戏')));
  let library=readLibrary(store);const id=library.activeId;library=deletePlay(store,library,id);
  assert.equal(library.activeId,null);assert.equal(readLibrary(store).plays.length,0);
  library=restorePlay(store,readLibrary(store),id);assert.equal(library.activeId,id);
});
test('deletion refuses stale writes and storage errors without losing games',()=>{
  const store=storage(),library=savePlay(store,emptyLibrary(),fresh('甲'),{create:true});
  const changed=savePlay(store,library,fresh('乙'),{create:true});
  assert.throws(()=>deletePlay(store,library,library.activeId),/另一标签页/);
  assert.deepEqual(readLibrary(store),changed);
  store.setItem=()=>{throw Error('quota')};
  assert.throws(()=>deletePlay(store,changed,changed.activeId),/quota/);
  assert.equal(changed.plays.length,2);assert.equal(readLibrary(store).plays.length,2);
});
test('new-game form asks for expansion, difficulty and investigators',()=>{
  const html=renderNewPlayForm(db,ui,'<select name="investigator"></select>');
  assert.ok(html.includes('name="expansion"'));assert.ok(html.includes('value="dwl"'));
  assert.ok(html.includes('name="investigator"'));assert.ok(!html.includes('name="name"'));
  assert.ok(html.includes('name="difficulty"'));assert.ok(!html.includes('覆盖'));
  for(const value of ['easy','standard','hard','expert'])assert.ok(html.includes(`value="${value}"`));
  assert.match(html,/value="standard" selected/);
});
