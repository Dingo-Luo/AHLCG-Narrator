export function createNarrationIndex(manifest, audio = {version:1,clips:{}}) {
  return {sources:new Map(manifest.sources.map(source=>[source.key,source])),units:new Map(manifest.units.map(unit=>[unit.id,unit])),audio};
}
export function resolveClip(unit, audio) {
  const clip=audio?.clips?.[unit?.id];
  if(!unit?.speak||!clip||clip.status!=='ready'||clip.textHash!==unit.textHash)return null;
  if(typeof clip.src!=='string'||!/^assets\/audio\/zh-CN\/[\w./-]+\.mp3$/.test(clip.src)||clip.src.split('/').some(part=>part==='.'||part==='..'))return null;
  return clip.src;
}

export function hasNarratedText(raw, sourceKey, index, range) {
  const source=index?.sources.get(sourceKey);
  if(!source||source.sourceText!==raw)return false;
  const start=range?.start??0,end=range?.end??raw.length;
  return source.units.some(id=>{
    const unit=index.units.get(id);
    return unit?.speak&&unit.start>=start&&unit.end<=end;
  });
}

// Annotate the unchanged source markup, rather than duplicating the paragraph in UI.
// A range is used for the conditional reverse of card 02067; the other branch is hidden.
export function renderNarratedText(raw, sourceKey, index, {prose,escape}, range) {
  const start=range?.start??0,end=range?.end??raw.length,visible=raw.slice(start,end);
  const source=index?.sources.get(sourceKey);
  if(!source)return prose(visible,false);
  if(source.sourceText!==raw)return `<p class="notice">本段配音编号待更新。</p>${prose(visible,false)}`;
  const units=source.units.map(id=>index.units.get(id)).filter(unit=>unit&&unit.start>=start&&unit.end<=end);
  let text=visible;
  for(let i=units.length-1;i>=0;i--) {
    const offset=units[i].start-start;
    text=text.slice(0,offset)+`\uE000${i}\uE001`+text.slice(offset);
  }
  return prose(text,false).replace(/\uE000(\d+)\uE001/g,(_,number)=>{
    const unit=units[Number(number)];
    return `<span hidden id="line-${escape(unit.id)}" data-narration-id="${escape(unit.id)}"></span>`;
  });
}
