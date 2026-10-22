import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chineseText, MISSING_TRANSLATION } from '../src/chinese.js';
import { validateContent } from '../scripts/validate-content.mjs';

test('Chinese display requires no source-key lookup', () => {
  assert.equal(chineseText('已有中文'), '已有中文');
  assert.equal(chineseText(3), '3');
  assert.equal(chineseText(''), '');
  assert.equal(chineseText('[cultist]'), '[cultist]');
  assert.equal(chineseText('#name#'), '#name#');
  assert.equal(chineseText('Legacy untranslated value'), MISSING_TRANSLATION);
});

test('content checks reject old catalogs and accept native Chinese markup and symbols', () => {
  assert.throws(()=>validateContent({ translations: {} }),/多语言目录/);
  assert.throws(()=>validateContent({ text: 'An English story' }),/需要中文/);
  assert.doesNotThrow(()=>validateContent({ text: '<b>故事</b> #name# [elder_thing]' }));
  assert.doesNotThrow(()=>validateContent({ text: '[cultist]' }));
});

test('all campaign and card display fields are Chinese-native', async () => {
  const fields=new Set(['name','title','text','description','scenario_name','header','full_name','confirm_text','subtext','note','masculine_text','feminine_text','nonbinary_text','subname','flavor','back_name','back_text','back_flavor','back_subname']);
  function check(value) {
    if(Array.isArray(value))return value.forEach(check);
    if(!value||typeof value!=='object')return;
    assert.ok(!('translations' in value));assert.ok(!('zh_cn' in value));assert.ok(!('zh' in value));
    for(const [key,text] of Object.entries(value)) {
      if(fields.has(key)&&typeof text==='string'&&text&&text!=='#name#'&&/[A-Za-z]/.test(text)&&!/^\[[a-z_]+\]$/.test(text))assert.match(text,/[\u3400-\u9fff]/u, key);
      else check(text);
    }
  }
  for(const name of ['core','dwl','ptc']) {
    const db=JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url)));
    check(db.campaign);check(db.scenarios);check(db.cards);check(db.dwlCards);check(db.encounterSets);
  }
});
