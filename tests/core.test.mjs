import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeCampaigns} from '../src/content.js';
import {createSave,commit,replay,currentStep,cultistCards} from '../src/engine.js';
const db=mergeCampaigns(JSON.parse(await readFile(new URL('../data/dwl.json',import.meta.url))),JSON.parse(await readFile(new URL('../data/core.json',import.meta.url))));
const run=(save,event)=>commit(db,save,event);
function advance(save,answer){return run(save,{type:'advance',...(answer!==undefined?{answer}:{})});}
function ready(save){let n=100;while(replay(db,save).active?.queue.length&&n--){const st=currentStep(db,replay(db,save));let answer;
 if(st.input?.type==='counter')answer=3;
 if(st.effects?.some(e=>e.type==='add_card'))answer={recipient:'i1'};
 if(st.input?.type==='choose_one')answer='__none';
 if(st.input?.type==='card_choice')answer=[];
 if(st.input?.type==='scenario_investigators')answer={replacements:{i1:'02001',i2:'02002'}};
 save=advance(save,answer);
 }assert.ok(n>0);return save;}
function begin(){let save=createSave([{name:'Roland',card:'01001'},{name:'Daisy',card:'01002'}],'Core',db.campaignSources.core,'core');save=run(save,{type:'start',scenario:'core_prologue'});save=ready(save);save=run(save,{type:'finish'});save=run(save,{type:'start',scenario:'torch'});return ready(save);}
const statuses={i1:'survived',i2:'physical'};
for(const resolution of ['no_resolution','R1','R2','R3'])test(`The Gathering ${resolution}: records and replacement investigators`,()=>{
 let save=begin();save=run(save,{type:'resolution',id:resolution,lead:'i1',statuses:resolution==='R1'||resolution==='R2'?statuses:{i1:'physical',i2:'mental'}});save=ready(save);save=run(save,{type:'finish'});
 const state=replay(db,JSON.parse(JSON.stringify(save)));assert.equal(state.nextScenario,'arkham');
 if(resolution==='R1'){assert.equal(state.investigators[0].mental,1);assert.equal(state.investigators[1].mental,0);}
 if(resolution==='R2'){assert.equal(state.investigators[0].earned,6);assert.equal(state.investigators[1].earned,5);}
 if(resolution==='R3'){assert.equal(state.investigators[0].earned,0);assert.equal(state.investigators[0].physical,0);assert.equal(state.investigators[0].card,'02001');}
});
function masks(){let save=begin();save=ready(run(save,{type:'resolution',id:'R1',lead:'i1',statuses}));save=run(save,{type:'finish'});return ready(run(save,{type:'start',scenario:'arkham'}));}
for(const id of ['no_resolution','R1','R2'])test(`Midnight Masks ${id}: cultists and forward navigation`,()=>{
 let save=run(masks(),{type:'resolution',id,lead:'i1',statuses:{i1:'resigned',i2:'physical'}});
 while(currentStep(db,replay(db,save)).input?.type!=='card_choice')save=advance(save);
 assert.equal(cultistCards(db,replay(db,save),currentStep(db,replay(db,save)).input).length,6);
 save=advance(save,['01137','01121b']);
 assert.throws(()=>advance(save,['01137']),/有效/);
 save=advance(save,['01138']);save=ready(save);save=run(save,{type:'finish'});
 const state=replay(db,save);assert.equal(state.nextScenario,'tentacles');assert.ok(state.log['cultists_interrogated:01137']);assert.ok(state.log['cultists_escaped:01138']);
 assert.equal(Boolean(state.log['campaign_notes:past_midnight']),id==='R2');
});
for(const id of ['no_resolution','R1','R2','R3'])test(`Devourer Below ${id}: campaign end and effects`,()=>{
 let save=ready(run(masks(),{type:'resolution',id:'R1',lead:'i1',statuses}));save=run(save,{type:'finish'});save=ready(run(save,{type:'start',scenario:'tentacles'}));save=ready(run(save,{type:'resolution',id,lead:'i1',statuses:{i1:'physical',i2:'mental'}}));save=run(save,{type:'finish'});
 const state=replay(db,save);assert.equal(state.nextScenario,null);assert.ok(state.result);
 if(id==='R3')assert.ok(state.investigators.every(i=>!i.storyCards.includes('01117')));
});
test('mixed history retains Dunwich version and rejects crossing campaigns',()=>{
 const old=createSave([{name:'Roland',card:'01001'}],'Dunwich',db.campaignSources.dwl);
 assert.equal(replay(db,old).nextScenario,'dwl_prologue');assert.throws(()=>run(old,{type:'start',scenario:'torch'}));
});
