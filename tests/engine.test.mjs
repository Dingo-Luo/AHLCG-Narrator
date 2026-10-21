import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSave, replay, commit, currentStep, cardDeck, boardCard } from '../src/engine.js';
import { renderBoard } from '../src/board.js';
import { parsePO } from '../scripts/import-data.mjs';
const db = JSON.parse(await readFile(new URL('../data/dwl.json', import.meta.url)));
const statuses = { i1:'survived', i2:'physical' };
// Original fixtures exercise compatibility with pre-story-only saves.
function fresh() { const save = createSave([{name:'罗兰',card:'01001'},{name:'温蒂',card:'01005'}]); delete save.flow; return save; }
function run(save,event) { return commit(db,save,event); }
function begin(first='1b') {
  let save=run(fresh(),{type:'start',scenario:'dwl_prologue'});
  save=run(save,{type:'advance'});
  save=run(save,{type:'advance',answer:first});
  save=run(save,{type:'finish'});
  return run(save,{type:'start',scenario:replay(db,save).nextScenario});
}
function completeSetup(save) {
  let safety=100;
  while(replay(db,save).active.phase==='setup' && safety--)save=run(save,{type:'advance'});
  assert.ok(safety>0);return save;
}
function finishResolution(save,cheat=false,points=3) {
  let safety=100;
  while(replay(db,save).active.phase==='resolution' && safety--){
    const step=currentStep(db,replay(db,save));
    let answer;
    if(step.input?.type==='counter')answer=points;
    if(step.input?.type==='choose_one')answer=cheat?'cheat':'__none';
    if(step.effects?.some(effect=>effect.type==='add_card'))answer={recipient:'i1'};
    save=run(save,{type:'advance',...(answer!==undefined?{answer}:{})});
  }
  assert.ok(safety>0);return run(save,{type:'finish'});
}
test('prologue respects both initial choices',()=>{
  assert.equal(replay(db,begin()).active.id,'the_house_always_wins');
  assert.equal(replay(db,begin('1a')).active.id,'extracurricular_activity');
});
for(const first of ['1a','1b']){
  const id=first==='1a'?'extracurricular_activity':'the_house_always_wins';
  for(const resolution of ['no_resolution','R1','R2','R3','R4']){
    test(`${id} ${resolution}: complete, serialize and replay without duplicate rewards`,()=>{
      let save=completeSetup(begin(first));
      save=run(save,{type:'resolution',id:resolution,statuses:resolution==='no_resolution'?{...statuses,i1:'resigned'}:statuses});
      save=finishResolution(save,true,3);
      const state=replay(db,save);
      const actual=resolution==='no_resolution'?(id==='extracurricular_activity'?'R4':'R1'):resolution;
      const bonus=actual==='R4'||id==='the_house_always_wins'&&actual==='R1'?1:0;
      assert.equal(state.investigators[0].earned,3+bonus);
      assert.equal(state.investigators[1].physical,1+(id==='the_house_always_wins'&&actual==='R4'?1:0));
      assert.equal(state.investigators[0].physical,id==='the_house_always_wins'&&actual==='R4'?1:0);
      assert.deepEqual(replay(db,JSON.parse(JSON.stringify(save))),state);
      assert.ok(state.completed[id]);
      assert.equal(state.nextScenario,first==='1a'?'the_house_always_wins':'extracurricular_activity');
      if(id==='the_house_always_wins')assert.ok(state.tokens.includes('elder_thing'));
      if(id==='the_house_always_wins'&&actual==='R2')assert.deepEqual(state.investigators[0].storyCards,['02080']);
    });
  }
}
test('prior House completion changes Faculty Offices setup automatically',()=>{
  let save=completeSetup(begin());
  save=run(save,{type:'resolution',id:'R1',statuses});save=finishResolution(save);
  save=run(save,{type:'start',scenario:'extracurricular_activity'});
  save=run(save,{type:'advance'});save=run(save,{type:'advance'});
  assert.equal(currentStep(db,replay(db,save)).id,'faculty_office_hour_is_late');
  let other=begin('1a');other=run(other,{type:'advance'});other=run(other,{type:'advance'});
  assert.equal(currentStep(db,replay(db,other)).id,'faculty_office_night_is_young');
});
test('second scenario progresses to Armitage interlude in both orders',()=>{
  for(const first of ['1a','1b']){
    let save=completeSetup(begin(first));save=run(save,{type:'resolution',id:'R1',statuses});save=finishResolution(save);
    save=run(save,{type:'start',scenario:replay(db,save).nextScenario});save=completeSetup(save);
    save=run(save,{type:'resolution',id:'R1',statuses});save=finishResolution(save);
    assert.equal(replay(db,save).nextScenario,'armitages_fate');
  }
});
test('optional cheat may be declined and effects are not applied',()=>{
  let save=completeSetup(begin());save=run(save,{type:'resolution',id:'R1',statuses});save=finishResolution(save,false);
  assert.ok(!replay(db,save).tokens.includes('elder_thing'));
});
test('undo and corrected resolution remove original effects',()=>{
  let save=completeSetup(begin());const before=save.events.length;
  save=run(save,{type:'resolution',id:'R4',statuses});save=finishResolution(save);
  save.events=save.events.slice(0,before);
  save=run(save,{type:'resolution',id:'R2',statuses});save=finishResolution(save);
  const state=replay(db,save);
  assert.equal(state.investigators[0].physical,0);
  assert.ok(!state.log['campaign_notes:francis_morgan_kidnapped']);
  assert.ok(state.log['campaign_notes:francis_morgan_rescued']);
});
test('spent XP cannot exceed earned and counters reject invalid data',()=>{
  assert.throws(()=>run(fresh(),{type:'adjust',investigator:'i1',field:'spent',delta:1}),/不能超过/);
  assert.throws(()=>run(fresh(),{type:'adjust',investigator:'i1',field:'earned',delta:NaN}),/整数/);
  assert.throws(()=>run(fresh(),{type:'adjust',investigator:'i1',field:'mental',delta:-1}),/整数/);
  let save=run(fresh(),{type:'adjust',investigator:'i1',field:'earned',delta:3});
  save=run(save,{type:'adjust',investigator:'i1',field:'spent',delta:2});
  assert.equal(replay(db,save).investigators[0].earned-replay(db,save).investigators[0].spent,1);
});
test('all event mutations fail closed before start or at the wrong phase',()=>{
  for(const event of [{type:'advance'},{type:'finish'},{type:'resolution',id:'R1',statuses},{type:'reveal',card:'02063',side:'back'},{type:'start',scenario:'blood_on_the_altar'},{type:'unknown'}])assert.throws(()=>run(fresh(),event));
});
test('import validation rejects malformed and duplicate investigator records',()=>{
  assert.throws(()=>replay(db,{version:50}));
  const save=fresh();save.investigators[1].id='i1';assert.throws(()=>replay(db,save));
});
test('PO parsing handles multiline strings and excludes fuzzy translations',()=>{
  assert.deepEqual(parsePO('msgid "a"\n"b"\nmsgstr "甲"\n"乙"\n\n#, fuzzy\nmsgid "x"\nmsgstr "错误"\n'),{ab:'甲乙'});
});
test('database preserves scenario links and source provenance',()=>{
  assert.equal(db.campaign.scenarios.length,12);
  for(const id of db.campaign.scenarios)assert.ok(db.scenarios[id]);
  assert.ok(db.cards['02063'].zh.back_text);
  assert.ok(db.cards['02067'].back_text.includes('Extracurricular Activity'));
  assert.ok(db.sources.every(item=>/^[a-f0-9]{40}$/.test(item.commit)));
});
test('pinned saves reject a changed content revision',()=>{
  const save=createSave([{name:'调查员'}],'版本验证','0'.repeat(40));
  assert.throws(()=>replay(db,save),/版本不同/);
});
test('no resolution requires all investigators to have left play',()=>{
  const save=completeSetup(begin());
  assert.throws(()=>run(save,{type:'resolution',id:'no_resolution',statuses}),/撤退或退场/);
});
test('every interactive agenda and act side has a real local image file',async()=>{
  const sources=JSON.parse(await readFile(new URL('../data/sources.json',import.meta.url)));
  assert.equal(sources.images.length,26);
  for(const image of sources.images){
    const bytes=await readFile(new URL('../'+image.path,import.meta.url));
    const header=bytes.subarray(0,3).toString('hex');
    assert.ok(header==='ffd8ff'||header==='89504e');
  }
});

function storyBegin(choice = '1b') {
  let save=createSave([{name:'调查员'}]);
  save=run(save,{type:'start',scenario:'dwl_prologue'});
  save=run(save,{type:'advance'});
  save=run(save,{type:'advance',answer:choice});
  save=run(save,{type:'finish'});
  return run(save,{type:'start',scenario:replay(db,save).nextScenario});
}
test('new flow goes straight from opening story to the two-card board',()=>{
  for(const choice of ['1a','1b']){
    let save=storyBegin(choice);
    assert.equal(currentStep(db,replay(db,save)).type,'story');
    save=run(save,{type:'advance'});
    const state=replay(db,save);
    assert.equal(state.active.phase,'play');
    assert.equal(state.active.queue.length,0);
    assert.equal(state.history.filter(item=>item.type==='step'&&item.scenario===state.active.id).length,1);
    assert.equal(boardCard(db,state,'agenda').card.stage,1);
    assert.equal(boardCard(db,state,'act').card.stage,1);
  }
});
test('legacy save switches flow without dropping events or changing investigator records',()=>{
  let save=begin();save=run(save,{type:'advance'}); // At the old encounter setup.
  const before=replay(db,save), count=save.events.length;
  save=run(save,{type:'story_only'});
  assert.equal(save.events.length,count+1);
  assert.equal(replay(db,save).active.phase,'play');
  assert.deepEqual(replay(db,save).investigators,before.investigators);
  assert.deepEqual(replay(db,save).completed,before.completed);
});
test('flips and advances persist independently for both card stacks',()=>{
  let save=run(storyBegin(),{type:'advance'});
  save=run(save,{type:'reveal',card:'02063',side:'back'});
  save=run(save,{type:'next_card',deck:'act'});
  let state=replay(db,JSON.parse(JSON.stringify(save)));
  assert.equal(boardCard(db,state,'agenda').side,'back');
  assert.equal(boardCard(db,state,'agenda').card.code,'02063');
  assert.equal(boardCard(db,state,'act').card.code,'02067');
  assert.equal(boardCard(db,state,'act').side,'front');
  save=run(save,{type:'next_card',deck:'agenda'});
  state=replay(db,save);
  assert.equal(boardCard(db,state,'agenda').card.code,'02064');
  assert.equal(boardCard(db,state,'agenda').side,'front');
  assert.equal(boardCard(db,state,'act').card.code,'02067');
});
test('next card respects the last card and rejects actions outside play',()=>{
  let save=run(storyBegin(),{type:'advance'});
  save=run(save,{type:'next_card',deck:'act'});
  save=run(save,{type:'next_card',deck:'act'});
  assert.equal(boardCard(db,replay(db,save),'act').last,true);
  assert.throws(()=>run(save,{type:'next_card',deck:'act'}),/最后/);
  assert.throws(()=>run(save,{type:'next_card',deck:'invalid'}),/类型/);
  assert.throws(()=>run(storyBegin(),{type:'next_card',deck:'act'}),/开场/);
});
test('House card variants and agenda 2b depend on prior scenario completion',()=>{
  let save=completeSetup(begin('1a'));
  save=run(save,{type:'resolution',id:'R1',statuses});save=finishResolution(save);
  save=run(save,{type:'story_only'});
  save=run(save,{type:'start',scenario:'the_house_always_wins'});save=run(save,{type:'advance'});
  assert.equal(cardDeck(db,replay(db,save),'act').at(-1).code,'02069');
  save=run(save,{type:'next_card',deck:'agenda'});
  assert.equal(boardCard(db,replay(db,save),'agenda').side,'back');
});
for(const cheated of [false,true])test(`recorded action (${cheated}) feeds resolution without asking again`,()=>{
  let save=run(storyBegin(),{type:'advance'});
  save=run(save,{type:'record_action',id:'cheated',value:cheated});
  save=run(save,{type:'resolution',id:'R1',statuses:{i1:'survived'}});
  let safety=30;
  while(replay(db,save).active.phase==='resolution'&&safety--){
    const step=currentStep(db,replay(db,save));
    assert.notEqual(step.id,'cheated');
    save=run(save,{type:'advance',...(step.input?.type==='counter'?{answer:3}:{})});
  }
  assert.ok(safety>0);
  save=run(save,{type:'finish'});
  assert.equal(replay(db,save).tokens.includes('elder_thing'),cheated);
  assert.equal(replay(db,save).investigators[0].earned,4);
});
test('board renders exactly two cards with per-card controls and hidden transcripts',()=>{
  const state=replay(db,run(storyBegin(),{type:'advance'}));
  const html=renderBoard(db,state,{locale:'en',L:(_zh,en)=>en,escape:String,prose:String,button:(label,action)=>`<button data-action="${action}">${label}</button>`});
  assert.equal((html.match(/class="board-card"/g)||[]).length,2);
  assert.equal((html.match(/data-action="next-card"/g)||[]).length,2);
  assert.equal((html.match(/data-action="flip-card"/g)||[]).length,2);
  assert.equal((html.match(/data-action="previous-card"/g)||[]).length,2);
  assert.equal((html.match(/<details class="card-transcript">/g)||[]).length,2);
  assert.equal((html.match(/disabled title="Narration/g)||[]).length,2);
  assert.ok(!html.includes('On the Right Track')); // Unrevealed reverse-side story.
});

test('new-game difficulty survives starting, saving and replaying the campaign',()=>{
  for(const value of ['easy','standard','hard','expert']){
    let save=commit(db,createSave([{name:'Roland',card:'01001'}]),{type:'difficulty',value});
    save=commit(db,save,{type:'start',scenario:'dwl_prologue'});
    save=commit(db,save,{type:'advance'});
    assert.equal(replay(db,JSON.parse(JSON.stringify(save))).difficulty,value);
    assert.throws(()=>commit(db,save,{type:'difficulty',value:'easy'}),/开始后/);
  }
  assert.throws(()=>commit(db,createSave([{name:'Roland',card:'01001'}]),{type:'difficulty',value:'invalid'}),/无效难度/);
});
