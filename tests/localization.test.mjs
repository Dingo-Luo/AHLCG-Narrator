import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localizedCard, investigatorName } from '../src/localization.js';
const db=JSON.parse(await readFile(new URL('../data/dwl.json',import.meta.url)));

test('cards use native Chinese fields without translation catalogs',()=>{
  assert.equal(db.cards['01001'].name,'罗兰·班克斯');
  assert.equal(db.cards['02066'].name,'歪打正着');
  for(const card of Object.values(db.cards)) {
    assert.equal(card.zh,undefined);assert.equal(card.zh_cn,undefined);
    assert.equal(localizedCard(card),card);
  }
  assert.equal(db.translations,undefined);
});

test('existing investigator saves use Chinese card names without rewriting saves',()=>{
  const investigator={id:'i1',card:'01001',name:'羅蘭·班克斯'};
  assert.equal(investigatorName(db,investigator),'罗兰·班克斯');
  assert.equal(investigator.name,'羅蘭·班克斯');
  assert.equal(investigatorName(db,{name:'自定义名称'}),'自定义名称');
  assert.deepEqual(localizedCard(null),{});
});
