import { createHash } from 'node:crypto';

export const categories = { story:0, ending:1, agenda_front:2, agenda_back:3, act_front:4, act_back:5 };
export const hashText = text => createHash('sha256').update(text).digest('hex');
const symbols={elder_sign:'古印',elder_thing:'古神',tablet:'石板',skull:'骷髅',cultist:'异教徒',auto_fail:'自动失败',willpower:'意志',intellect:'智力',combat:'战力',agility:'敏捷',per_investigator:'每位调查员',action:'行动',reaction:'反应',free:'自由行动'};
export function spokenText(raw) {
  return raw.replace(/<cite\b[^>]*>[\s\S]*?<\/cite>/gi,'')
    .replace(/<[^>]*>/g,'').replace(/\[\[([^\]]+)\]\]/g,'$1')
    .replace(/\[([a-z_]+)\]/g,(token,key)=>symbols[key]||token)
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

// Source offsets allow the same IDs to be placed next to the exact on-screen paragraph.
// Italic text and Chinese quotation marks alone never turn rules into narration.
export function splitSource(raw, role) {
  const quotes = [...raw.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)]
    .map(match=>({start:match.index+match[0].indexOf('>')+1,end:match.index+match[0].lastIndexOf('</')}));
  const boundaries = new Set([0,raw.length]);
  for(const match of raw.matchAll(/\r?\n|<br\s*\/?\s*>|<hr\s*\/?\s*>/gi)) {
    boundaries.add(match.index);boundaries.add(match.index+match[0].length);
  }
  for(const quote of quotes){boundaries.add(quote.start);boundaries.add(quote.end);}
  const positions=[...boundaries].sort((a,b)=>a-b),segments=[];
  for(let i=0;i<positions.length-1;i++) {
    let start=positions[i],end=positions[i+1];
    while(start<end&&/\s/.test(raw[start]))start++;
    while(end>start&&/\s/.test(raw[end-1]))end--;
    const text=spokenText(raw.slice(start,end));
    if(!text)continue;
    const quoted=quotes.some(quote=>start>=quote.start&&end<=quote.end);
    const missing=text.includes('此段暂无中文译文');
    const instruction=/^(?:阅读|閱讀).*(?:结局|結局)/.test(text);
    const narrative=role==='narrative'||role==='card_rules'&&quoted;
    segments.push({start,end,text,role:missing?'missing':narrative&&!instruction?'narrative':role==='title'?'title':'rules',speak:!missing&&narrative&&!instruction});
  }
  return segments;
}

// Match unchanged paragraphs first. Insertions receive new numbers, without shifting
// later paragraphs; a modified paragraph between matched neighbours keeps its number.
export function assignLines(segments, previous = [], prefix, reserved = []) {
  const old=previous, pairs=[],n=old.length,m=segments.length;
  const lengths=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
    lengths[i][j]=old[i].text===segments[j].text?1+lengths[i+1][j+1]:Math.max(lengths[i+1][j],lengths[i][j+1]);
  let i=0,j=0;
  while(i<n&&j<m) {
    if(old[i].text===segments[j].text){pairs.push([i++,j++]);}
    else if(lengths[i+1][j]>=lengths[i][j+1])i++;else j++;
  }
  const matches=new Map(pairs.map(([a,b])=>[b,a]));
  const anchors=[[-1,-1],...pairs,[n,m]];
  for(let k=1;k<anchors.length;k++) {
    const [a,b]=anchors[k-1],[c,d]=anchors[k];
    if(c-a===d-b)for(let x=1;x<c-a;x++)matches.set(b+x,a+x);
  }
  let next=Math.max(0,...[...old,...reserved].map(unit=>Number(unit.id.split('-').at(-1))))+1;
  return segments.map((segment,index)=>{
    const prior=old[matches.get(index)],id=prior?.id||`${prefix}-${next++}`;
    return {...segment,id,textHash:hashText(segment.text),revision:(prior?.revision||1)+(prior&&prior.text!==segment.text?1:0)};
  });
}

export function collectSources(databases, chapters) {
  const sources=[],scenarios=new Map(),cards=new Map();
  for(const [campaignId,book] of Object.entries(chapters)) {
    const db=databases[campaignId];
    for(const [scenarioId,chapter] of Object.entries(book.scenarios)) {
      const scenario=db.scenarios[scenarioId];
      if(!scenario)throw Error(`找不到章节：${scenarioId}`);
      scenarios.set(scenarioId,{campaignId,campaign:book.campaign,chapter,scenarioId,chapterTitle:scenario.scenario_name});
      const context={...scenarios.get(scenarioId),sourceFile:`data/${campaignId}.json`};
      for(const [index,step] of scenario.steps.entries())if(step.text&&(step.type==='story'||step.narration))
        sources.push({...context,key:`scenario:${scenarioId}:step:${step.id}:text`,category:categories.story,title:step.title||'故事',pointer:`/scenarios/${scenarioId}/steps/${index}/text`,raw:step.text,role:'narrative'});
      for(const [index,resolution] of (scenario.resolutions||[]).entries())if(resolution.text)
        sources.push({...context,key:`scenario:${scenarioId}:resolution:${resolution.id}:text`,category:categories.ending,title:resolution.title||'结局',pointer:`/scenarios/${scenarioId}/resolutions/${index}/text`,raw:resolution.text,role:'narrative'});
    }
  }
  // Same precedence as mergeCampaigns. Card IDs can be present in several content files.
  for(const campaignId of ['dwl','core','ptc'])for(const collection of ['cards','dwlCards'])
    for(const card of Object.values(databases[campaignId]?.[collection]||{}))cards.set(card.code,{card,campaignId,collection});
  for(const {card,campaignId,collection} of [...cards.values()].sort((a,b)=>a.card.code.localeCompare(b.card.code))) {
    if(!['agenda','act'].includes(card.type_code))continue;
    const context=scenarios.get(['flood','vortex'].includes(card.encounter_code)?'black_stars_rise':card.encounter_code);
    if(!context)continue;
    for(const side of ['front','back'])for(const suffix of ['name','flavor','text']) {
      const field=(side==='back'?'back_':'')+suffix,raw=card[field];if(!raw)continue;
      sources.push({...context,key:`card:${card.code}:${field}`,category:categories[`${card.type_code}_${side}`],title:card[side==='back'?'back_name':'name']||card.name,cardCode:card.code,side,field,sourceFile:`data/${campaignId}.json`,pointer:`/${collection}/${card.code}/${field}`,raw,role:suffix==='flavor'?'narrative':suffix==='name'?'title':'card_rules'});
    }
  }
  return sources;
}

export function buildManifest(sources, previous = {sources:[],units:[],retired:[]}) {
  const oldSources=new Map(previous.sources.map(source=>[source.key,source]));
  const oldUnits=new Map(previous.units.map(unit=>[unit.id,unit]));
  const counters=new Map(),units=[],records=[];
  for(const source of [...previous.sources,...(previous.retiredSources||[])]) {
    const prefix=`${source.campaign}-${source.chapter}-${source.category}`;
    counters.set(prefix,Math.max(counters.get(prefix)||0,source.block));
  }
  for(const {raw,role,...source} of sources) {
    const group=`${source.campaign}-${source.chapter}-${source.category}`,prior=oldSources.get(source.key);
    const block=prior?.block||((counters.get(group)||0)+1);counters.set(group,Math.max(counters.get(group)||0,block));
    const lines=assignLines(splitSource(raw,role),(prior?.units||[]).map(id=>oldUnits.get(id)).filter(Boolean),`${group}-${block}`,
      (previous.retired||[]).filter(unit=>unit.sourceKey===source.key));
    if(prior&&`${prior.campaign}-${prior.chapter}-${prior.category}`!==group)throw Error(`章节编号不可自动更改：${source.key}`);
    records.push({...source,block,sourceText:raw,sourceHash:hashText(raw),units:lines.map(line=>line.id)});
    units.push(...lines.map(line=>({...line,sourceKey:source.key,audioPath:line.speak?`assets/audio/zh-CN/${source.campaign}/${source.chapter}/${line.id}.${line.textHash.slice(0,12)}.mp3`:null})));
  }
  const active=new Set(units.map(unit=>unit.id)),retired=new Map((previous.retired||[]).map(unit=>[unit.id,unit]));
  for(const unit of previous.units)if(!active.has(unit.id))retired.set(unit.id,unit);
  const activeKeys=new Set(records.map(source=>source.key)),retiredSources=new Map((previous.retiredSources||[]).map(source=>[source.key,source]));
  for(const source of previous.sources)if(!activeKeys.has(source.key))retiredSources.set(source.key,source);
  return {version:1,language:'zh-CN',idScheme:'campaign-chapter-category-block-paragraph',categories,sources:records,units,retired:[...retired.values()],retiredSources:[...retiredSources.values()]};
}
