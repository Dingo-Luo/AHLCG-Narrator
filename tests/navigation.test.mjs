import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSave, commit, replay, currentStep, playPosition, boardCard } from '../src/engine.js';
import { moveTo, storyNavigation, browseCard } from '../src/navigation.js';
const db=JSON.parse(await readFile(new URL('../data/dwl.json',import.meta.url)));
function begin(){
  let save=createSave([{name:'调查员'}]);
  for(const event of [{type:'start',scenario:'dwl_prologue'},{type:'advance'},{type:'advance',answer:'1b'},{type:'finish'},{type:'start',scenario:'the_house_always_wins'},{type:'advance'},{type:'record_action',id:'cheated',value:true}])save=commit(db,save,event);
  return save;
}
function completed(){
  let save=commit(db,begin(),{type:'resolution',id:'R4',statuses:{i1:'physical'}});
  let safety=40;
  while(replay(db,save).active.phase==='resolution'&&safety--){
    const step=currentStep(db,replay(db,save));
    save=commit(db,save,{type:'advance',...(step.input?.type==='counter'?{answer:3}:{})});
  }
  assert.ok(safety>0);
  save=commit(db,save,{type:'finish'});
  save=commit(db,save,{type:'start',scenario:'extracurricular_activity'});
  return commit(db,save,{type:'advance'});
}
test('story back and forward retain all recorded choices and chapter history',()=>{
  const original=completed(), full=structuredClone(original.events);
  let save=original;
  for(let round=0;round<3;round++){
    let guard=80;
    while(storyNavigation(db,save).previous!==null&&guard--)save=moveTo(db,save,storyNavigation(db,save).previous);
    assert.ok(guard>0);assert.equal(replay(db,save).active.id,'dwl_prologue');
    guard=80;
    while(storyNavigation(db,save).next!==null&&guard--)save=moveTo(db,save,storyNavigation(db,save).next);
    assert.ok(guard>0);assert.equal(replay(db,save).active.id,'extracurricular_activity');
    assert.deepEqual(save.events,full);assert.deepEqual(replay(db,save),replay(db,original));
  }
});
test('chapter selector includes visited chapters and can jump to an earlier opening',()=>{
  const save=completed(), nav=storyNavigation(db,save);
  assert.deepEqual(nav.chapters.map(item=>item.id),['dwl_prologue','the_house_always_wins','extracurricular_activity']);
  const earlier=moveTo(db,save,nav.chapters[1].position);
  assert.equal(replay(db,earlier).active.phase,'setup');assert.equal(currentStep(db,replay(db,earlier)).id,'prologue');
});
test('reselecting the same choice uses recorded future without deleting later events',()=>{
  const original=completed();const earlier=moveTo(db,original,2);
  const continued=commit(db,earlier,{answer:'1b',type:'advance'});
  assert.equal(playPosition(continued),3);
  assert.deepEqual(continued.events,original.events);
});
test('changing an earlier choice removes dependent future and recalculates awards',()=>{
  const original=completed();assert.equal(replay(db,original).investigators[0].physical,2);
  const changed=commit(db,moveTo(db,original,2),{type:'advance',answer:'1a'});
  const state=replay(db,changed);
  assert.equal(changed.events.length,3);assert.equal(state.nextScenario,'extracurricular_activity');
  assert.equal(state.investigators[0].earned,0);assert.equal(state.investigators[0].physical,0);
  assert.equal(Object.keys(state.log).length,0);
});
test('undo and redo of a manual adjustment restore values without repeated rewards',()=>{
  const save=commit(db,begin(),{type:'adjust',investigator:'i1',field:'earned',delta:2});
  const earlier=moveTo(db,save,save.events.length-1);
  assert.equal(replay(db,earlier).investigators[0].earned,0);
  const restored=moveTo(db,earlier,save.events.length);
  assert.equal(replay(db,restored).investigators[0].earned,2);assert.equal(restored.events.length,save.events.length);
});
test('card browsing has independent previous/next controls and keeps future story intact',()=>{
  const original=completed();let earlier=moveTo(db,original,7);
  earlier=browseCard(db,earlier,'act','next');earlier=browseCard(db,earlier,'agenda','flip');
  let state=replay(db,earlier);
  assert.equal(boardCard(db,state,'act').card.code,'02067');assert.equal(boardCard(db,state,'agenda').side,'back');
  earlier=browseCard(db,earlier,'act','previous');state=replay(db,earlier);
  assert.equal(boardCard(db,state,'act').card.code,'02066');assert.equal(boardCard(db,state,'agenda').side,'back');
  assert.deepEqual(earlier.events,original.events);assert.equal(playPosition(earlier),7);
  const restored=moveTo(db,JSON.parse(JSON.stringify(earlier)),original.events.length);
  assert.deepEqual(replay(db,restored).investigators,replay(db,original).investigators);
});
test('card and story navigation reject invalid boundaries and malformed cursors',()=>{
  const save=begin();
  assert.throws(()=>moveTo(db,save,0));assert.throws(()=>moveTo(db,save,save.events.length+1));
  assert.throws(()=>replay(db,{...save,cursor:-1}));assert.throws(()=>replay(db,{...save,cursor:1.5}));
  assert.throws(()=>browseCard(db,save,'act','previous'),/边界/);
  assert.throws(()=>browseCard(db,moveTo(db,save,1),'agenda','next'),/开场/);
});
test('browsed card positions persist across refresh and reset when a choice creates a new branch',()=>{
  let save=browseCard(db,completed(),'agenda','next');
  assert.equal(boardCard(db,replay(db,JSON.parse(JSON.stringify(save))),'agenda').card.stage,2);
  save=commit(db,moveTo(db,save,2),{type:'advance',answer:'1a'});
  assert.equal(save.cardViews,undefined);
});
