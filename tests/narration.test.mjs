import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectSources,buildManifest,splitSource,assignLines } from '../scripts/narration-lib.mjs';
import { createNarrationIndex,resolveClip,renderNarratedText } from '../src/narration.js';
import { renderBoard } from '../src/board.js';
import { mergeCampaigns } from '../src/content.js';
const read=async file=>JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));
const databases=Object.fromEntries(await Promise.all(['core','dwl','ptc'].map(async id=>[id,await read(`data/${id}.json`)])));
const chapters=await read('data/narration/chapters.json'),manifest=await read('data/narration/index.json');
const sources=collectSources(databases,chapters),index=createNarrationIndex(manifest);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const prose=value=>`<div>${escape(value)}</div>`;

test('every story, ending, and supported card paragraph has a unique searchable ID',()=>{
  assert.equal(new Set(manifest.units.map(unit=>unit.id)).size,manifest.units.length);
  assert.equal(manifest.sources.length,sources.length);
  assert.deepEqual(buildManifest(sources,manifest),manifest);
  for(const source of manifest.sources) {
    assert.equal(source.sourceText,sources.find(item=>item.key===source.key).raw);
    for(const id of source.units) {
      const unit=index.units.get(id);
      assert.match(id,/^\d+-\d+-[0-5]-\d+-\d+$/);
      assert.equal(unit.sourceKey,source.key);
      if(!unit.speak)assert.equal(unit.audioPath,null);
    }
  }
});

test('Paris Conspiracy reads only the requested prose, excluding the title and both objectives',()=>{
  const source=index.sources.get('card:03204:flavor');
  assert.deepEqual(source.units,['2-5-4-2-1']);
  const unit=index.units.get(source.units[0]);
  assert.equal(unit.text,'你走出火车站，经过圣巴拿波教堂时，耳旁飘来一阵风琴声。这么晚了还在布道吗？这奔放奇特的和音扣紧了你的心弦，你不禁驻足倾听了片刻才继续上路。巴黎很大，而你手头的线索很少……');
  assert.equal(unit.speak,true);
  for(const field of ['name','text'])for(const id of index.sources.get(`card:03204:${field}`).units)assert.equal(index.units.get(id).speak,false);
});

test('only blockquoted passages in card rules qualify; italics and quotation marks are insufficient',()=>{
  const raw='<b>如果花费线索：</b>\n<blockquote><i>你走过教堂。</i></blockquote>\n每位调查员受到2点恐惧。\n<i>目标：推进。</i>\n“减去毁灭标记。”';
  const parts=splitSource(raw,'card_rules');
  assert.deepEqual(parts.filter(unit=>unit.speak).map(unit=>unit.text),['你走过教堂。']);
  assert.equal(parts.filter(unit=>!unit.speak).length,4);
  assert.deepEqual(splitSource('叙述。<cite>——作者署名</cite>','narrative').map(unit=>unit.text),['叙述。']);
  assert.equal(splitSource('此段暂无中文译文。','narrative')[0].speak,false);
  assert.equal(splitSource('阅读<b>结局1</b>','narrative')[0].speak,false);
});

test('inserting or editing paragraphs preserves existing IDs and invalidates old audio hashes',()=>{
  const old=assignLines(splitSource('第一段。\n第二段。','narrative'),[],'0-1-0-1');
  const inserted=assignLines(splitSource('第一段。\n新增段落。\n第二段。','narrative'),old,'0-1-0-1');
  assert.deepEqual(inserted.map(unit=>unit.id),['0-1-0-1-1','0-1-0-1-3','0-1-0-1-2']);
  const edited=assignLines(splitSource('第一段修改。\n第二段。','narrative'),old,'0-1-0-1');
  assert.equal(edited[0].id,old[0].id);assert.notEqual(edited[0].textHash,old[0].textHash);
  assert.equal(edited[0].revision,2);
  assert.equal(resolveClip(edited[0],{clips:{[old[0].id]:{src:'assets/audio/zh-CN/old.mp3',textHash:old[0].textHash,status:'ready'}}}),null);
});

test('deleted source and paragraph IDs are retired rather than reassigned',()=>{
  const source={campaign:0,chapter:1,category:0,key:'s1',raw:'甲段。\n乙段。',role:'narrative'};
  const initial=buildManifest([source]);
  const removed=buildManifest([{...source,raw:'甲段。'}],initial);
  const added=buildManifest([{...source,raw:'甲段。\n丙段。'}],removed);
  assert.equal(added.units[1].id,'0-1-0-1-3');
  assert.equal(added.retired[0].id,'0-1-0-1-2');
  const replacement=buildManifest([{...source,key:'s2'}],buildManifest([],initial));
  assert.equal(replacement.sources[0].block,2);
  assert.deepEqual(buildManifest([{...source,key:'s2'}],replacement),replacement);
});

test('audio lookup requires a narrative ID, matching text, confirmed status and local audio path',()=>{
  const unit=index.units.get('2-5-4-2-1');
  const clip={src:unit.audioPath,textHash:unit.textHash,status:'ready'};
  const audio={clips:{[unit.id]:clip}};
  assert.equal(resolveClip(unit,audio),unit.audioPath);
  assert.equal(resolveClip({...unit,speak:false},audio),null);
  assert.equal(resolveClip(unit,{clips:{[unit.id]:{...clip,status:'draft'}}}),null);
  assert.equal(resolveClip(unit,{clips:{[unit.id]:{...clip,src:'assets/audio/zh-CN/../../outside.mp3'}}}),null);
  assert.equal(resolveClip(unit,{clips:{[unit.id]:{...clip,src:'https://example.com/file.mp3'}}}),null);
});

test('rendering adds IDs without deleting rules and avoids IDs/audio when the source is stale',()=>{
  const source=index.sources.get('card:03204:flavor'),unit=index.units.get(source.units[0]);
  const current=createNarrationIndex(manifest,{clips:{[unit.id]:{src:unit.audioPath,textHash:unit.textHash,status:'ready'}}});
  const html=renderNarratedText(source.sourceText,source.key,current,{prose,escape});
  assert.ok(html.includes(`data-narration-id="${unit.id}"`));
  assert.ok(html.includes('<span hidden'));assert.ok(!html.includes('<button'));assert.ok(!html.includes('待配音'));
  const stale=renderNarratedText(source.sourceText+'修改',source.key,current,{prose,escape});
  assert.ok(!stale.includes('data-action="narrate-line"'));assert.ok(stale.includes('编号待更新'));
  const rules=index.sources.get('card:03204:text');
  const ruleHtml=renderNarratedText(rules.sourceText,rules.key,current,{prose,escape});
  assert.ok(ruleHtml.includes('目标'));assert.ok(!ruleHtml.includes('narrate-line'));
});

test('card 02067 shows IDs from only the correct conditional reverse branch',()=>{
  const db=mergeCampaigns(structuredClone(databases.dwl),structuredClone(databases.core),structuredClone(databases.ptc));
  const source=index.sources.get('card:02067:back_text');
  const divider=/<hr\s*\/?\s*>/i.exec(source.sourceText);assert.ok(divider);
  for(const completed of [false,true]) {
    const state={active:{id:'the_house_always_wins',board:{act:{code:'02067',side:'back'}}},completed:completed?{extracurricular_activity:{}}:{}};
    const html=renderBoard(db,state,{L:zh=>zh,escape,prose,button:()=>'',narratedText:(raw,key,range)=>renderNarratedText(raw,key,index,{prose,escape},range)});
    for(const id of source.units) {
      const unit=index.units.get(id),visible=completed?unit.start>divider.index:unit.end<=divider.index;
      assert.equal(html.includes(`data-narration-id="${id}"`),visible,id);
    }
  }
});
