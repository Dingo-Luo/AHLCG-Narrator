export function createMusicPlayer({createAudio=()=>new Audio(),createAudioContext=()=>{
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  return Context?new Context():null;
},onChange=()=>{}}={}) {
  const audio=createAudio();
  audio.loop=true;
  audio.preload='none';
  audio.volume=0.2;
  let track=null,playing=false,request=0,volume=0.2,context=null,gain=null,source=null;
  const snapshot=()=>({track,playing,volume});
  const notify=()=>onChange(snapshot());
  audio.onerror=()=>{request++;playing=false;notify();};
  audio.onpause=()=>{playing=false;notify();};
  async function play() {
    if(!track)return;
    const token=++request;
    try {
      // Create/unlock the graph in the click gesture. iOS may ignore audio.volume.
      if(!gain) {
        context=context||createAudioContext();
        if(context) {
          gain=context.createGain();
          gain.gain.value=volume;
          gain.connect(context.destination);
          source=context.createMediaElementSource(audio);
          source.connect(gain);
          audio.volume=1;
        }
      }
      const resumed=context&&context.state!=='running'?context.resume():Promise.resolve();
      await Promise.all([resumed,audio.play()]);
      if(token!==request)return;
      playing=true;notify();
    } catch(error) {
      if(token!==request)return;
      playing=false;notify();
      throw error;
    }
  }
  async function select(next) {
    if(!next)return;
    if(track?.src!==next.src) {
      request++;audio.pause();track=next;audio.src=next.src;audio.currentTime=0;
      playing=false;notify();
    }
    await play();
  }
  async function toggle(defaultTrack=null) {
    if(!track){if(defaultTrack)await select(defaultTrack);return;}
    if(playing){request++;audio.pause();playing=false;notify();}
    else await play();
  }
  function setVolume(value) {
    const next=Number(value);
    if(!Number.isFinite(next))return;
    volume=Math.min(1,Math.max(0,next));
    if(gain)gain.gain.value=volume;
    else audio.volume=volume;
    audio.muted=volume===0;
    notify();
  }
  return {select,toggle,setVolume,snapshot};
}
