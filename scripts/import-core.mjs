import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parsePO} from './import-data.mjs';
const root=new URL('../',import.meta.url),repository='zzorba/arkham-cards-data';
const request=async url=>{const r=await fetch(url,{headers:{'User-Agent':'AHLCG-Narrator'}});if(!r.ok)throw Error(`${r.status}: ${url}`);return r.text()};
const commit=JSON.parse(await request(`https://api.github.com/repos/${repository}/commits/master`)).sha;
const files=[],scenarios={},translations={'zh-cn':{},zh:{}};
let campaign;
for(const name of ['campaign','torch','arkham','tentacles']){
  for(const locale of [null,'zh-cn','zh']){
    const path=locale?`i18n/${locale}/campaigns/notz/${name}.po`:`campaigns/notz/${name}.json`;
    const url=`https://raw.githubusercontent.com/${repository}/${commit}/${path}`,source=await request(url);
    const target=new URL(`data/upstream/arkham-cards-data/${path}`,root);
    await mkdir(new URL('./',target),{recursive:true});await writeFile(target,source);
    files.push({path,url,sha256:createHash('sha256').update(source).digest('hex')});
    if(locale)Object.assign(translations[locale],parsePO(source));
    else if(name==='campaign')campaign=JSON.parse(source);else scenarios[name]=JSON.parse(source);
  }
}
// Preserve the original campaign prologue as a story chapter, excluding deck/setup inputs.
scenarios.core_prologue={id:'core_prologue',scenario_name:'Prologue',setup:['prologue'],steps:[campaign.steps.find(s=>s.id==='prologue')],resolutions:[],storyChapter:true};
const base=JSON.parse(await readFile(new URL('data/dwl.json',root),'utf8'));
const cards=Object.fromEntries(Object.entries(base.cards).filter(([,c])=>c.pack_code==='core'));
const images=[],exec=promisify(execFile);
const deckCards=Object.values(cards).filter(c=>['agenda','act'].includes(c.type_code)&&['torch','arkham','tentacles'].includes(c.encounter_code));
const hunter=cards['01121b'],agenda=cards['01121a'];
for(const catalog of [null,'zh','zh_cn']){
  const source=catalog?hunter[catalog]:hunter,target=catalog?agenda[catalog]:agenda;
  if(source&&target)for(const field of ['name','text','flavor'])if(source[field])target[`back_${field}`]=source[field];
}
await mkdir(new URL('assets/cards/',root),{recursive:true});
for(let i=0;i<deckCards.length;i+=4)await Promise.all(deckCards.slice(i,i+4).map(async card=>{
  for(const side of ['front','back']){
    const suffix=side==='back'?'b':'',code=card.code==='01121a'&&side==='back'?'01121b':`${card.code}${suffix}`,url=`https://arkhamdb.com/bundles/cards/${code}.png`;
    let path=`assets/cards/${card.code}${suffix}.png`,target=new URL(path,root);
    const {fileURLToPath}=await import('node:url');
    const jpeg=new URL(path.replace('.png','.jpg'),root);
    try{await readFile(jpeg);target=jpeg;path=path.replace('.png','.jpg');}catch{
      for(let attempt=0;;attempt++){
        try{await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri $env:AHLCG_IMAGE_URL -OutFile $env:AHLCG_IMAGE_TARGET"],{windowsHide:true,env:{...process.env,AHLCG_IMAGE_URL:url,AHLCG_IMAGE_TARGET:fileURLToPath(target)},timeout:60000});break;}
        catch(error){if(attempt>=2)throw Error(`Image download failed: ${url}`,{cause:error});}
      }
    }
    const bytes=await readFile(target);
    if(bytes.subarray(0,3).toString('hex')==='ffd8ff'&&path.endsWith('.png')){
      const {rename}=await import('node:fs/promises');path=path.replace('.png','.jpg');await rename(target,new URL(path,root));
    }else if(bytes.subarray(0,3).toString('hex')!=='ffd8ff'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Invalid image ${url}`);
    card.images[side]=path;images.push({code:card.code,side,url,path,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  card.images.downloaded=true;
}));
const data={campaign:{...campaign,scenarios:['core_prologue',...campaign.scenarios]},scenarios,translations,cards,source:{repository,commit},interactiveScenarios:['core_prologue','torch','arkham','tentacles']};
await writeFile(new URL('data/core.json',root),JSON.stringify(data,null,2)+'\n');
await writeFile(new URL('data/core-sources.json',root),JSON.stringify({repository,commit,files,images},null,2)+'\n');
console.log(JSON.stringify({commit,chapters:Object.keys(scenarios),images:images.length,translations:Object.fromEntries(Object.entries(translations).map(([k,v])=>[k,Object.keys(v).length]))}));
