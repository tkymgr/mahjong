export const SOUND_IDS = ['clear','lose','naki','notice','puyo','ribo','sute','tenbo','tumo'];

class Clip {
  constructor(audio, buffer) { this.audio=audio; this.buffer=buffer; this.source=null; this.loop=false; this.isPlaying=false; }
  play({loop=false}={}) {
    this.stop(); const source=this.audio.context.createBufferSource(); source.buffer=this.buffer; source.loop=loop;
    source.connect(this.audio.masterGain); this.source=source; this.loop=loop; this.isPlaying=true;
    source.onended=()=>{ if(this.source===source){this.source=null;this.isPlaying=false;} source.disconnect(); };
    source.start(); return true;
  }
  stop() { const source=this.source; this.source=null; this.isPlaying=false; if(source){try{source.stop();}catch{}source.disconnect();} }
}

// Audio stays independent of the 3D renderer and retains the approved WAVs.
export class GameAudio {
  constructor(preferences,onChange=()=>{}) {
    this.preferences=preferences;this.onChange=onChange;this.sounds=new Map();this.disposed=false;
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.context=Context?new Context():null;
    if(this.context){this.masterGain=this.context.createGain();this.masterGain.gain.value=.65;this.masterGain.connect(this.context.destination);}
    this.notify();
  }
  async load(base) {
    if(!this.context)return;
    await Promise.allSettled(SOUND_IDS.map(async id=>{
      const response=await fetch(`${base}js/w_${id}.wav`);if(!response.ok)throw Error(id);
      const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      if(!this.disposed)this.sounds.set(id,new Clip(this,buffer));
    }));
    this.notify();
  }
  notify(){if(!this.disposed)this.onChange({enabled:this.preferences.sound,available:this.sounds.size>0});}
  async unlock(){try{if(this.context&&['suspended','interrupted'].includes(this.context.state))await this.context.resume();}catch{}}
  setEnabled(value){this.preferences.sound=value;if(!value)this.stopAll();this.notify();}
  play(id,loop=false){if(this.preferences.sound&&!this.disposed)this.sounds.get(id)?.play({loop});}
  stop(id){this.sounds.get(id)?.stop();}
  stopAll(){for(const clip of this.sounds.values())clip.stop();}
  dispose(){if(this.disposed)return;this.disposed=true;this.stopAll();this.sounds.clear();this.masterGain?.disconnect();this.context?.close().catch(()=>{});this.onChange=()=>{};}
}
