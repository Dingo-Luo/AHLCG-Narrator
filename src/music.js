export function createMusicPlayer({createAudio=()=>new Audio(),onChange=()=>{}}={}) {
  const audio=createAudio();
  audio.loop=true;
  audio.preload='none';
  audio.volume=0.2;
  let track=null,playing=false,request=0;
  const snapshot=()=>({track,playing,volume:audio.volume});
  const notify=()=>onChange(snapshot());
  audio.onerror=()=>{request++;playing=false;notify();};
  audio.onpause=()=>{playing=false;notify();};
  async function play() {
    if(!track)return;
    const token=++request;
    try {
      await audio.play();
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
    const volume=Number(value);
    if(!Number.isFinite(volume))return;
    audio.volume=Math.min(1,Math.max(0,volume));notify();
  }
  return {select,toggle,setVolume,snapshot};
}
