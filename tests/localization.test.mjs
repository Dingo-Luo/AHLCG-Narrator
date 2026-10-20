import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localizedCard, investigatorName } from '../src/localization.js';
const db=JSON.parse(await readFile(new URL('../data/dwl.json',import.meta.url)));
const audit=JSON.parse(await readFile(new URL('../data/simplified-chinese-audit.json',import.meta.url)));
test('all playable investigators and agenda/act cards have upstream Simplified Chinese fields',()=>{
  assert.equal(audit.playableInvestigators,10);assert.equal(audit.playableAgendaAndActCards,13);
  assert.deepEqual(audit.missingPlayableFields,[]);assert.equal(audit.conversionPerformed,false);
  for(const item of audit.verified){
    const card=db.cards[item.code];assert.ok(card.zh_cn);
    for(const field of ['name','subname','text','flavor','back_name','back_text','back_flavor'])if(card[field]?.trim())assert.ok(card.zh_cn[field]?.trim(),`${card.code}/${field}`);
  }
});
test('Simplified Chinese data is exactly the upstream JSON, not converted Traditional text',async()=>{
  const files=new Map();
  for(const item of audit.verified){
    if(!files.has(item.source))files.set(item.source,JSON.parse(await readFile(new URL('../data/upstream/arkhamdb-json-data/'+item.source,import.meta.url))));
    const raw=files.get(item.source).find(card=>card.code===item.code);
    assert.deepEqual(db.cards[item.code].zh_cn,raw);
  }
  assert.equal(localizedCard(db.cards['01001'],'zh-cn').name,'罗兰·班克斯');
  assert.equal(localizedCard(db.cards['02066'],'zh-cn').name,'歪打正着');
  assert.notEqual(db.cards['02066'].zh_cn.text,db.cards['02066'].zh.text);
  assert.equal(localizedCard(db.cards['02063'],'en').name,'The Clover Club');
});
test('existing investigator saves display upstream Simplified names without rewriting saves',()=>{
  const investigator={id:'i1',card:'01001',name:'羅蘭·班克斯'};
  assert.equal(investigatorName(db,investigator,'zh-cn'),'罗兰·班克斯');
  assert.equal(investigator.name,'羅蘭·班克斯');
  assert.equal(investigatorName(db,{name:'自定义名称'},'zh-cn'),'自定义名称');
});
test('missing Simplified fields remain unchanged instead of being character-converted',()=>{
  const card={name:'English',text:'English text',zh:{name:'繁體原文',text:'尚未翻譯的文字'},zh_cn:{name:'已有的简体译文'}};
  const translated=localizedCard(card,'zh-cn');
  assert.equal(translated.name,'已有的简体译文');assert.equal(translated.text,'尚未翻譯的文字');
  assert.equal(card.zh.text,'尚未翻譯的文字');
});
