import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeCampaigns} from '../src/content.js';
import {browseCard,chooseCardVersion,storyNavigation} from '../src/navigation.js';
import {renderBoard} from '../src/board.js';
import {createSave,commit,replay,currentStep,cultistCards,storyActions,boardCard,allowedStatuses} from '../src/engine.js';
const read=async file=>JSON.parse(await readFile(new URL(`../data/${file}.json`,import.meta.url)));
const db=mergeCampaigns(await read('dwl'),await read('core'),await read('ptc'));
const run=(save,event)=>commit(db,save,event);
function answerFor(save,step,choiceIndex=0){
 const state=replay(db,save),input=step.input;
 if(input?.type==='choose_one')return input.choices[choiceIndex%input.choices.length].id;
 if(input?.type==='counter')return Math.min(2,input.max?.value??2);
 if(input?.type==='card_choice')return cultistCards(db,state,input).slice(0,1).map(c=>c.code);
 if(input?.type==='investigator_choice')return ['i1'];
 if(input?.type==='investigator_counter')return Object.fromEntries(state.investigators.map(i=>[i.id,1]));
 if(input?.type==='scenario_investigators'){
  const dead=state.investigators.filter(i=>i.killed||i.insane),excluded=[...state.investigators.map(i=>i.card),...(state.retired||[])];
  const candidates=Object.values(db.cards).filter(c=>c.type_code==='investigator'&&/^0[123]\d{3}$/.test(c.code)&&!excluded.includes(c.code));
  return {replacements:Object.fromEntries(dead.map((i,index)=>[i.id,candidates[index].code]))};
 }
 if(step.effects?.some(e=>e.type==='add_card'))return {recipient:state.active.leadId||'i1'};
}
function walk(save,choiceIndex=0){let n=200;while(replay(db,save).active?.queue.length&&n--){const step=currentStep(db,replay(db,save));try{save=run(save,{type:'advance',answer:answerFor(save,step,choiceIndex)});}catch(error){throw Error(`${replay(db,save).active.id}/${step.id}: ${error.message}`,{cause:error});}}assert.ok(n>0);return save;}
function resolution(save,id,choiceIndex=0){
 const state=replay(db,save),allowed=allowedStatuses(db.scenarios[state.active.id].resolutions.find(r=>r.id===id));
 const preferred=id.startsWith('no_resolution')?'physical':'survived';
 const statuses=Object.fromEntries(state.investigators.map(i=>[i.id,allowed.includes(preferred)?preferred:allowed[0]]));
 return walk(run(save,{type:'resolution',id,statuses,lead:'i1'}),choiceIndex);
}
const arrivals={};
for(const campaignId of ['dwl','ptc'])for(const variant of [0,1])test(`${campaignId} complete campaign through all chapters (choice route ${variant})`,()=>{
 let save=createSave([{name:'Roland',card:'01001'},{name:'Daisy',card:'01002'}],campaignId,db.campaignSources[campaignId],campaignId),n=30,visited=[];
 while(replay(db,save).nextScenario&&n--){
  const id=replay(db,save).nextScenario;save=run(save,{type:'start',scenario:id});save=walk(save,variant);const state=replay(db,save);visited.push(id);
  if(state.active.phase==='play'){
   arrivals[id]??=save;
   for(const deck of ['agenda','act'])assert.ok(boardCard(db,state,deck)||id==='black_stars_rise');
   const res=db.scenarios[id].resolutions.find(r=>r.id==='R1')||db.scenarios[id].resolutions[0];save=resolution(save,res.id,variant);
  }
  assert.equal(replay(db,save).active.phase,'ready',id);save=run(save,{type:'finish'});
 }
 assert.ok(n>0);assert.ok(visited.includes(campaignId==='dwl'?'lost_in_time_and_space':'dim_carcosa'));assert.equal(replay(db,JSON.parse(JSON.stringify(save))).nextScenario,null);
});
test('every Dunwich and Carcosa resolution can be completed without dropping rules',()=>{
 for(const [id,save]of Object.entries(arrivals))for(const res of db.scenarios[id].resolutions)for(const route of [0,1,2]){
  const completed=resolution(save,res.id,route);assert.equal(replay(db,completed).active.phase,'ready',`${id}/${res.id}/${route}`);
 }
});
test('in-scenario story actions retain the card board and are reversible',()=>{
 for(const save of Object.values(arrivals)){
  const initial=replay(db,save);
  for(const action of storyActions(db,initial)){
   const next=walk(run(save,{type:'story_action',id:action.id}));assert.equal(replay(db,next).active.phase,'play',`${initial.active.id}/${action.id}`);
   assert.deepEqual(replay(db,{...next,cursor:save.events.length}),initial);
  }
 }
});
test('Carcosa always uses the campaign-box story edition, without an edition prompt',()=>{
 const campaign=db.campaigns.ptc;
 assert.equal(campaign.edition,'reprint');assert.ok(campaign.scenarios.includes('ptc_interlude1_reprint'));assert.ok(!campaign.scenarios.includes('ptc_interlude1'));
 const save=createSave([{name:'Lola',card:'03006'}],'PTC',db.campaignSources.ptc,'ptc');
 let next=run(save,{type:'start',scenario:'ptc_prologue'});
 assert.equal(currentStep(db,replay(db,next)).id,'intro');
 next=run(next,{type:'advance'});assert.ok(storyNavigation(db,next).previous!==null);
 assert.ok(replay(db,next).log['hidden:reprint_language']);
});
test('Black Stars Rise has independent agenda stacks, hidden reverses and local variant images',async()=>{
 let save=arrivals.black_stars_rise;
 assert.equal(boardCard(db,replay(db,save),'agenda').card.code,'03275');assert.equal(boardCard(db,replay(db,save),'act').card.code,'03278');
 save=browseCard(db,save,'agenda','next');assert.equal(boardCard(db,replay(db,save),'agenda').card.stage,2);
 save=chooseCardVersion(db,save,'agenda','03276b');save=browseCard(db,save,'agenda','flip');
 assert.equal(boardCard(db,replay(db,save),'act').card.code,'03278');
 assert.equal(boardCard(db,replay(db,save),'agenda').side,'back');
 assert.throws(()=>chooseCardVersion(db,save,'agenda','03279b'),/版本/);
 for(const code of ['03276a','03276b','03279a','03279b'])for(const side of ['front','back'])assert.ok((await readFile(new URL('../'+db.cards[code].images[side],import.meta.url))).length>1000);
 const html=renderBoard(db,replay(db,arrivals.black_stars_rise),{L:(a)=>a,escape:s=>s,button:()=>'',prose:s=>s,locale:'zh-cn'});
 assert.equal((html.match(/<img /g)||[]).length,2);assert.ok(html.includes('密谋 1c'));
});
test('individual clue XP is balanced and investigator status follows the chosen resolution',()=>{
 assert.ok(allowedStatuses(db.scenarios.essex_county_express.resolutions.find(r=>r.id==='R1')).includes('survived'));
 assert.ok(!allowedStatuses(db.scenarios.essex_county_express.resolutions.find(r=>r.id==='no_resolution')).includes('resigned'));
 let save=run(arrivals.the_last_king,{type:'resolution',id:'no_resolution_resigned',lead:'i1',statuses:{i1:'resigned',i2:'resigned'}}),n=100;
 while(currentStep(db,replay(db,save))?.input?.type!=='investigator_counter'&&n--){const step=currentStep(db,replay(db,save));save=run(save,{type:'advance',answer:answerFor(save,step)});}
 assert.ok(n>0);assert.throws(()=>run(save,{type:'advance',answer:{i1:3,i2:0}}),/平均/);
});
test('all three campaigns keep source text and have complete Simplified Chinese card fields and local artwork',async()=>{
 const scenarios=['torch','arkham','tentacles',...db.campaigns.dwl.scenarios,...db.campaigns.ptc.scenarios];
 for(const card of Object.values(db.cards).filter(c=>['agenda','act'].includes(c.type_code)&&(scenarios.includes(c.encounter_code)||['flood','vortex'].includes(c.encounter_code)))){
  for(const field of ['name','text','back_name','back_text','flavor','back_flavor'])if(card[field])assert.ok(card.zh_cn?.[field],`${card.code}/${field}`);
  for(const side of ['front','back']){
   assert.match(card.images[side],/^assets\/cards\//);const bytes=await readFile(new URL('../'+card.images[side],import.meta.url));assert.ok(bytes.length>1000);
  }
 }
});
