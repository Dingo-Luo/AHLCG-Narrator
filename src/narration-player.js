import { resolveClip } from './narration.js';

// DOM order is the reading order. Unmapped files use the indexed hash-based path.
export function narrationClips(index, ids) {
  return [...new Set(ids)].flatMap(id=>{
    const unit=index.units.get(id);
    if(!unit?.speak)return [];
    const mapped=index.audio?.clips?.[id];
    const src=resolveClip(unit,mapped?index.audio:{clips:{[id]:{src:unit.audioPath,status:'ready',textHash:unit.textHash}}});
    return src?[src]:[];
  });
}

export function createNarrationPlayer({createAudio=src=>new Audio(src),onStop=()=>{}}={}) {
  let generation=0,current=null;
  function stop() {
    generation++;
    if(current) {
      current.onended=null;current.onerror=null;
      current.pause();current.removeAttribute('src');current.load();
    }
    current=null;onStop();
  }
  function play(clips) {
    stop();
    const token=generation,queue=[...clips];
    function next() {
      if(token!==generation)return;
      if(current){current.onended=null;current.onerror=null;current.pause();current=null;}
      const src=queue.shift();
      if(!src){stop();return;}
      const audio=createAudio(src);current=audio;
      let advanced=false;
      function advance() {
        if(advanced||token!==generation||current!==audio)return;
        advanced=true;next();
      }
      audio.onended=advance;
      audio.onerror=advance;
      Promise.resolve().then(()=>{
        if(token===generation&&current===audio)return audio.play();
      }).catch(error=>{
        if(token!==generation||current!==audio)return;
        if(error.name==='NotAllowedError'){stop();return;}
        advance();
      });
    }
    next();
  }
  return {play,stop};
}
