import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parsePO} from './import-data.mjs';
const root=new URL('../',import.meta.url),headers={'User-Agent':'AHLCG-Narrator'},records=[],snapshots=[];
async function request(url){const r=await fetch(url,{headers});if(!r.ok)throw Error(`${r.status}: ${url}`);return r.text()}
const scenarios={},translations={'zh-cn':{},zh:{}},rawCards=[],cardTranslations={'zh-cn':{},zh:{}};let campaign;
for(const repository of ['zzorba/arkham-cards-data','zzorba/arkhamdb-json-data']){
 const commit=JSON.parse(await request(`https://api.github.com/repos/${repository}/commits/master`)).sha;snapshots.push({repository,commit});
 const tree=JSON.parse(await request(`https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`));
 const files=tree.tree.filter(f=>f.type==='blob'&&(repository.endsWith('arkham-cards-data')?/^(campaigns\/ptc\/.*\.json|i18n\/(zh-cn|zh)\/campaigns\/ptc\/.*\.po)$/.test(f.path):/^(pack\/ptc\/.*\.json|translations\/(zh-cn|zh)\/pack\/ptc\/.*\.json)$/.test(f.path)));
 for(let i=0;i<files.length;i+=8)await Promise.all(files.slice(i,i+8).map(async f=>{
  const url=`https://raw.githubusercontent.com/${repository}/${commit}/${f.path}`,source=await request(url),target=new URL(`data/upstream/${repository.split('/')[1]}/${f.path}`,root);
  await mkdir(new URL('./',target),{recursive:true});await writeFile(target,source);records.push({repository,path:f.path,url,sha256:createHash('sha256').update(source).digest('hex')});
  if(f.path.endsWith('.po'))Object.assign(translations[f.path.split('/')[1]],parsePO(source));
  else if(f.path.startsWith('campaigns/')){const parsed=JSON.parse(source);if(f.path.endsWith('/campaign.json'))campaign=parsed;else if(parsed.id!=='core')scenarios[parsed.id]=parsed;}
  else if(f.path.startsWith('pack/'))rawCards.push(...JSON.parse(source));
  else for(const card of JSON.parse(source))cardTranslations[f.path.split('/')[1]][card.code]=card;
 }));
}
const base=JSON.parse(await readFile(new URL('data/dwl.json',root),'utf8'));
const cards=Object.fromEntries(rawCards.map(c=>[c.code,{...c,zh:cardTranslations.zh[c.code],zh_cn:cardTranslations['zh-cn'][c.code],images:{front:`https://arkhamdb.com/bundles/cards/${c.code}.png`,back:`https://arkhamdb.com/bundles/cards/${c.code}b.png`,language:'en',downloaded:false},audio:{en:null,'zh-cn':null}}]));
for(const card of Object.values(cards).filter(c=>c.back_link)){const back=cards[card.back_link];if(back)for(const cat of [null,'zh','zh_cn']){const target=cat?card[cat]:card,source=cat?back[cat]:back;if(target&&source)for(const field of ['name','text','flavor'])if(source[field])target['back_'+field]=source[field];}}
const images=[],exec=promisify(execFile),allCards={...base.cards,...cards};
const deckCards=Object.values(allCards).filter(c=>/^0[23]/.test(c.code)&&['agenda','act'].includes(c.type_code)&&([...base.campaign.scenarios,...Object.keys(scenarios),'vortex','flood']).includes(c.encounter_code));
await mkdir(new URL('assets/cards/',root),{recursive:true});
for(let i=0;i<deckCards.length;i+=5){await Promise.all(deckCards.slice(i,i+5).map(async c=>{
 for(const side of ['front','back']){
  const code=side==='front'?c.code:c.back_link||`${c.code}b`;
  const url=`https://arkhamdb.com/bundles/cards/${code}.png`;let path=`assets/cards/${code}.jpg`,target=new URL(path,root),bytes;
  try{bytes=await readFile(target);}catch{path=path.replace('.jpg','.png');target=new URL(path,root);try{bytes=await readFile(target);}catch{
   for(let attempt=0;;attempt++){try{await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri $env:AHLCG_IMAGE_URL -OutFile $env:AHLCG_IMAGE_TARGET"],{windowsHide:true,timeout:60000,env:{...process.env,AHLCG_IMAGE_URL:url,AHLCG_IMAGE_TARGET:fileURLToPath(target)}});bytes=await readFile(target);break;}catch(error){if(attempt>=2)throw Error(`Card image failed: ${url}`,{cause:error});}}
  }}
  if(bytes.subarray(0,3).toString('hex')==='ffd8ff'){if(path.endsWith('.png')){const dest=path.replace('.png','.jpg');await rename(target,new URL(dest,root));path=dest;}}
  else if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Invalid image: ${url}`);
  c.images[side]=path;images.push({code:c.code,side,url,path,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 c.images.downloaded=true;
 }));console.log(`Card images ${Math.min(i+5,deckCards.length)}/${deckCards.length}`);}
const dwlCards=Object.fromEntries(deckCards.filter(c=>c.code.startsWith('02')).map(c=>[c.code,c]));
const data={campaign,scenarios,translations,cards,source:snapshots[0],dwlCards};
await writeFile(new URL('data/ptc.json',root),JSON.stringify(data,null,2)+'\n');
await writeFile(new URL('data/expansion-sources.json',root),JSON.stringify({snapshots,files:records,images},null,2)+'\n');
console.log(JSON.stringify({chapters:Object.keys(scenarios),images:images.length,cards:rawCards.length}));
