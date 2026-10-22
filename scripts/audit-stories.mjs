import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateContent} from './validate-content.mjs';
import {mergeCampaigns} from '../src/content.js';
const root=new URL('../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const db=mergeCampaigns(await read('data/dwl.json'),await read('data/core.json'),await read('data/ptc.json'));
for(const name of ['core','dwl','ptc']) {
 const data=await read(`data/${name}.json`);
 if(data.translations)throw Error('内容中仍有多语言目录');
 for(const key of ['campaign','scenarios','cards','dwlCards','encounterSets'])validateContent(data[key],`${name}/${key}`);
}
const images=new Set(),missing=[];
for(const campaign of Object.values(db.campaigns))for(const id of campaign.scenarios){
 for(const card of Object.values(db.cards).filter(c=>['agenda','act'].includes(c.type_code)&&(c.encounter_code===id||id==='black_stars_rise'&&['flood','vortex'].includes(c.encounter_code)))){
  for(const field of ['name','text','flavor','back_name','back_text','back_flavor'])if(card[field]==='此段暂无中文译文。')missing.push(`${card.code}:${field}`);
  for(const side of ['front','back']){const path=card.images[side];if(!path?.startsWith('assets/'))throw Error(`Missing local image ${card.code}/${side}`);await readFile(new URL(path,root));images.add(path);}
 }
}
for(const file of ['data/core-sources.json','data/expansion-sources.json']){
 const source=await read(file);
 for(const image of source.images){const bytes=await readFile(new URL(image.path,root));if(createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw Error(`Image checksum mismatch: ${image.path}`);}

}
if(missing.length)throw Error(`缺少中文卡牌字段: ${missing.join(', ')}`);
const report={edition:'campaign-box',voiceIncluded:false,conversionPerformed:false,campaigns:Object.fromEntries(Object.entries(db.campaigns).map(([id,c])=>[id,{name:c.name,chapters:c.scenarios,scenarios:c.scenarios.filter(s=>db.scenarios[s].resolutions?.length>0),sourceRevision:db.campaignSources[id]}])),localCardImages:images.size,missingSimplifiedCardFields:missing};
await writeFile(new URL('data/story-coverage.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({campaigns:Object.fromEntries(Object.entries(report.campaigns).map(([id,c])=>[id,c.scenarios.length])),localCardImages:images.size,missingSimplifiedCardFields:missing}));
