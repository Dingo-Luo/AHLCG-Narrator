import test from 'node:test';
import assert from 'node:assert/strict';
import {createNarrationPlayer,narrationClips} from '../src/narration-player.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup() {
  const audios=[];let stopped=0;
  const player=createNarrationPlayer({onStop(){stopped++;},createAudio(src){
    const audio={src,paused:false,play(){return Promise.resolve();},pause(){this.paused=true;},removeAttribute(){},load(){}};
    audios.push(audio);return audio;
  }});
  return {player,audios,stopped:()=>stopped};
}
test('queue plays in order, skips missing files once, and finishes',async()=>{
  const {player,audios,stopped}=setup();
  player.play(['one','missing','three']);await tick();
  assert.deepEqual(audios.map(a=>a.src),['one']);
  audios[0].onended();await tick();
  const missing=audios[1];missing.onerror();await tick();
  assert.deepEqual(audios.map(a=>a.src),['one','missing','three']);
  assert.equal(missing.onended,null);
  audios[2].onended();assert.equal(stopped(),2);
});
test('navigation/stop cancels pending callbacks and a replacement queue',async()=>{
  const {player,audios}=setup();player.play(['old','never']);await tick();
  const oldEnd=audios[0].onended;
  player.play(['new']);oldEnd();await tick();
  assert.deepEqual(audios.map(a=>a.src),['old','new']);
  const newEnd=audios[1].onended;player.stop();newEnd();await tick();
  assert.equal(audios.length,2);assert.ok(audios.every(a=>a.paused));
});
test('rejected media skips forward; browser autoplay refusal stops',async()=>{
  const audios=[];
  const player=createNarrationPlayer({createAudio(src){const audio={pause(){},removeAttribute(){},load(){},play(){return src==='bad'?Promise.reject(new Error('missing')):Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));}};audios.push(audio);return audio;}});
  player.play(['bad','blocked','never']);await tick();await tick();
  assert.equal(audios.length,2);
});
test('only spoken paragraphs queue, in visible order, with stale/draft mappings excluded',()=>{
  const units=new Map(['a','b','rule','draft','stale'].map(id=>[id,{id,speak:id!=='rule',textHash:'hash',audioPath:`assets/audio/zh-CN/0/1/${id}.hash.mp3`}]));
  const index={units,audio:{clips:{draft:{status:'draft'},stale:{status:'ready',textHash:'old',src:units.get('stale').audioPath}}}};
  assert.deepEqual(narrationClips(index,['b','rule','a','b','draft','stale']),[units.get('b').audioPath,units.get('a').audioPath]);
});
