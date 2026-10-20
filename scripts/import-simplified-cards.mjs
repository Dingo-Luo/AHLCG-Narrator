import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const repository='zzorba/arkhamdb-json-data';
async function request(url,json=true){const response=await fetch(url,{headers:{'User-Agent':'AHLCG-Narrator'}});if(!response.ok)throw Error(`${response.status}: ${url}`);return json?response.json():response.text();}
const database=JSON.parse(await readFile(path.join(root,'data/dwl.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,'data/sources.json'),'utf8'));
const commit=(await request(`https://api.github.com/repos/${repository}/commits/master`)).sha;
const tree=await request(`https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`);
const files=tree.tree.filter(item=>item.type==='blob'&&/^translations\/zh-cn\/pack\/(core|dwl)\/.*\.json$/.test(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
const records=[],translations={},cardPaths={};
for(let index=0;index<files.length;index+=6){
  const batch=await Promise.all(files.slice(index,index+6).map(async item=>{
    const url=`https://raw.githubusercontent.com/${repository}/${commit}/${item.path}`;
    const source=await request(url,false);
    const target=path.join(root,'data/upstream/arkhamdb-json-data',item.path);
    await mkdir(path.dirname(target),{recursive:true});await writeFile(target,source);
    return {path:item.path,url,source};
  }));
  for(const item of batch){
    records.push({repository,path:item.path,url:item.url,sha256:createHash('sha256').update(item.source).digest('hex')});
    for(const card of JSON.parse(item.source)){translations[card.code]=card;cardPaths[card.code]=item.path;}
  }
}
for(const card of Object.values(database.cards))card.zh_cn=translations[card.code]||null;
const visible=Object.values(database.cards).filter(card=>card.type_code==='investigator'&&/^(01|02)\d{3}$/.test(card.code)||database.interactiveScenarios.includes(card.encounter_code)&&['agenda','act'].includes(card.type_code));
const fields=['name','subname','flavor','text','back_name','back_flavor','back_text'];
const missing=visible.flatMap(card=>fields.filter(field=>card[field]?.trim()&&!card.zh_cn?.[field]?.trim()).map(field=>({code:card.code,field})));
if(missing.length)throw Error(`Current playable content has missing Simplified Chinese fields: ${JSON.stringify(missing)}`);
const source={locale:'zh-cn',repository,commit,files:records};
database.cardTranslationSources??={};database.cardTranslationSources['zh-cn']={repository,commit};
manifest.cardTranslations=[...(manifest.cardTranslations||[]).filter(item=>item.locale!=='zh-cn'),source];
const audit={locale:'zh-cn',repository,commit,conversionPerformed:false,files:records.length,translatedCards:Object.values(database.cards).filter(card=>card.zh_cn).length,
  playableInvestigators:visible.filter(card=>card.type_code==='investigator').length,playableAgendaAndActCards:visible.filter(card=>card.type_code!=='investigator').length,missingPlayableFields:missing,
  verified:visible.map(card=>({code:card.code,name:card.zh_cn.name,source:cardPaths[card.code]}))};
await writeFile(path.join(root,'data/dwl.json'),JSON.stringify(database,null,2)+'\n');
await writeFile(path.join(root,'data/sources.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'data/simplified-chinese-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({...audit,verified:undefined},null,2));
