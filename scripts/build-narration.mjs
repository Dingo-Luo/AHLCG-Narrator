import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildManifest, collectSources } from './narration-lib.mjs';
import { resolveClip } from '../src/narration.js';

const root=new URL('../',import.meta.url);
const read=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
const databases=Object.fromEntries(await Promise.all(['core','dwl','ptc'].map(async id=>[id,await read(`data/${id}.json`)])));
const chapters=await read('data/narration/chapters.json');
let previous;
try{previous=await read('data/narration/index.json');}catch(error){if(error.code!=='ENOENT')throw error;}
const manifest=buildManifest(collectSources(databases,chapters),previous);
const audio=await read('data/narration/audio.json');
const byId=new Map(manifest.units.map(unit=>[unit.id,unit]));
if(audio.version!==1||!audio.clips||typeof audio.clips!=='object'||Array.isArray(audio.clips))throw Error('配音映射格式不正确');
const audioProblems=[];
for(const [id,clip] of Object.entries(audio.clips)) {
  try {
  const unit=byId.get(id);
  if(!unit)throw Error(`配音编号不存在或已停用：${id}`);
  if(!resolveClip(unit,audio))throw Error(`配音不匹配、尚未确认或属于非旁白文本：${id}`);
  const target=path.resolve(fileURLToPath(root),clip.src);
  if(!target.startsWith(path.resolve(fileURLToPath(root),'assets/audio')+path.sep))throw Error(`配音路径越界：${id}`);
  if(!(await stat(target)).isFile())throw Error(`找不到配音文件：${id}`);
  } catch(error) {
    audioProblems.push({id,message:error.message});
  }
}
if(process.argv.includes('--check')&&audioProblems.length)throw Error(JSON.stringify(audioProblems));
const lines=['# 配音脚本索引','','本文件自动生成；修改原内容后运行 `npm run build:narration`。编号不可手动重排。','',
  '只有标记「配音」的段落进入录音稿；标题、规则及缺译提示仅编号定位，不配音。',''];
for(const source of manifest.sources) {
  lines.push(`## ${source.campaign}-${source.chapter} · ${source.chapterTitle} · ${source.title}`,'',
    `定位：\`${source.sourceFile}#${source.pointer}\` · \`${source.key}\``,'');
  for(const id of source.units) {
    const unit=byId.get(id);
    lines.push(`### ${id} · ${unit.speak?'配音':unit.role==='missing'?'缺译，不配音':'不配音'}`,'',unit.text,'');
    if(unit.speak)lines.push(`音频：\`${unit.audioPath}\``, `文本校验：\`${unit.textHash}\``,'');
  }
}
const outputs={'data/narration/index.json':JSON.stringify(manifest,null,2)+'\n','docs/配音脚本.md':lines.join('\n')+'\n'};
for(const [file,contents] of Object.entries(outputs)) {
  if(process.argv.includes('--check')) {
    if(await readFile(new URL(file,root),'utf8')!==contents)throw Error(`配音索引待更新：${file}；运行 npm run build:narration`);
  } else {
    await mkdir(new URL('./',new URL(file,root)),{recursive:true});await writeFile(new URL(file,root),contents);
  }
}
console.log(JSON.stringify({sources:manifest.sources.length,paragraphs:manifest.units.length,narrated:manifest.units.filter(unit=>unit.speak).length,excluded:manifest.units.filter(unit=>!unit.speak).length,audioClips:Object.keys(audio.clips).length,audioProblems}));
