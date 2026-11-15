import { VOICE_ACTIONS, VOICE_IDS } from './voices.js';
export const SOUND_IDS = ['clear','lose','naki','notice','puyo','ribo','sute','tenbo','tumo'];
const VARIANT_IDS = new Set(['tumo','sute','naki','ribo']);

class Clip {
  constructor(audio, buffers) { this.audio=audio; this.buffers=buffers; this.buffer=buffers[0]; this.next=0; this.source=null; this.loop=false; this.isPlaying=false; }
  play({loop=false}={}) {
    this.stop(); const source=this.audio.context.createBufferSource();
    source.buffer=loop?this.buffers[0]:this.buffers[this.next++%this.buffers.length]; source.loop=loop;
    source.connect(this.audio.masterGain); this.source=source; this.loop=loop; this.isPlaying=true;
    source.onended=()=>{ if(this.source===source){this.source=null;this.isPlaying=false;} source.disconnect(); };
    source.start(); return true;
  }
  stop() { const source=this.source; this.source=null; this.isPlaying=false; if(source){try{source.stop();}catch{}source.disconnect();} }
}

// Original synthesized audio. Effects and music have independent gain/control.
export class GameAudio {
  constructor(preferences,onChange=()=>{}) {
    this.preferences=preferences;this.onChange=onChange;this.sounds=new Map();this.disposed=false;
    this.voices=new Map();this.voiceQueue=[];this.voiceSource=null;this.voiceHistory=[];
    this.musicBuffer=null;this.musicSource=null;this.musicOffset=0;this.scene='title';this.hidden=false;
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.context=Context?new Context():null;
    if(this.context){
      this.masterGain=this.context.createGain();this.masterGain.gain.value=.65;this.masterGain.connect(this.context.destination);
      this.voiceGain=this.context.createGain();this.voiceGain.gain.value=this.preferences.voiceVolume??.8;this.voiceGain.connect(this.context.destination);
      this.musicGain=this.context.createGain();this.musicGain.gain.value=0;this.musicGain.connect(this.context.destination);
    }
    this.notify();
  }
  async decode(url){const response=await fetch(url);if(!response.ok)throw Error(url);return this.context.decodeAudioData(await response.arrayBuffer());}
  async load(base) {
    if(!this.context)return;
    await Promise.allSettled([
      ...SOUND_IDS.map(async id=>{
        const paths=[`${base}js/w_${id}.wav`,...(VARIANT_IDS.has(id)?[2,3].map(i=>`${base}js/w_${id}_${i}.wav`):[])];
        const decoded=await Promise.allSettled(paths.map(url=>this.decode(url)));
        const buffers=decoded.filter(r=>r.status==='fulfilled').map(r=>r.value);
        if(!this.disposed&&buffers.length)this.sounds.set(id,new Clip(this,buffers));
      }),
      ...VOICE_IDS.flatMap(id=>Object.keys(VOICE_ACTIONS).map(action=>this.decode(`${base}voices/${id}/${action}.mp3`).then(buffer=>{if(!this.disposed)this.voices.set(`${id}:${action}`,buffer);}))),
      this.decode(`${base}js/bgm-salon.mp3`).then(buffer=>{if(!this.disposed){this.musicBuffer=buffer;this.syncMusic();}})
    ]);
    this.notify();
  }
  notify(){if(!this.disposed)this.onChange({enabled:this.preferences.sound,available:this.sounds.size>0,musicEnabled:this.preferences.music,musicAvailable:!!this.musicBuffer,musicVolume:this.preferences.musicVolume,voiceEnabled:this.preferences.voice,voiceAvailable:this.voices.size>0,voiceVolume:this.preferences.voiceVolume});}
  async unlock(){try{if(this.context&&['suspended','interrupted'].includes(this.context.state))await this.context.resume();if(!this.disposed)this.syncMusic();}catch{}}
  setEnabled(value){this.preferences.sound=Boolean(value);if(!value)this.stopEffects();this.notify();}
  setVoiceEnabled(value){this.preferences.voice=Boolean(value);if(!value)this.stopVoices();this.notify();}
  setVoiceVolume(value){if(!Number.isFinite(value))return;this.preferences.voiceVolume=Math.max(0,Math.min(1,value));if(this.voiceGain)this.voiceGain.gain.setTargetAtTime(this.preferences.voiceVolume,this.context.currentTime,.02);this.notify();}
  speak(id,action){
    const buffer=this.voices.get(`${id}:${action}`);
    if(!this.preferences.voice||this.disposed||this.hidden||this.context?.state!=='running'||!buffer)return false;
    if(this.voiceQueue.length>=4)this.voiceQueue.shift();
    this.voiceQueue.push({id,action,buffer});this.nextVoice();return true;
  }
  nextVoice(){
    if(this.voiceSource||this.disposed||this.hidden||!this.preferences.voice)return;
    const entry=this.voiceQueue.shift();if(!entry)return;
    const source=this.context.createBufferSource();source.buffer=entry.buffer;source.connect(this.voiceGain);this.voiceSource=source;
    this.voiceHistory.push({id:entry.id,action:entry.action});if(this.voiceHistory.length>24)this.voiceHistory.shift();
    source.onended=()=>{source.disconnect();if(this.voiceSource===source){this.voiceSource=null;this.nextVoice();}};
    this.updateMusicGain(true);source.start();
  }
  stopVoices(){this.voiceQueue=[];const source=this.voiceSource;this.voiceSource=null;if(source){source.stop();source.disconnect();}}
  setMusicEnabled(value){this.preferences.music=Boolean(value);this.syncMusic();this.notify();}
  setMusicVolume(value){if(!Number.isFinite(value))return;this.preferences.musicVolume=Math.max(0,Math.min(1,value));this.updateMusicGain();this.notify();}
  setScene(phase){if(this.scene===phase)return;this.scene=phase;if(['title','finished'].includes(phase)){this.musicOffset=0;this.stopVoices();}this.syncMusic();}
  setHidden(hidden){this.hidden=hidden;if(hidden)this.stopVoices();this.syncMusic();}
  updateMusicGain(duck=false){
    if(!this.context||this.disposed)return;
    const gain=this.musicGain.gain,t=this.context.currentTime;
    gain.cancelScheduledValues(t);gain.setValueAtTime(gain.value,t);
    gain.linearRampToValueAtTime((this.preferences.musicVolume??.25)*(duck ? .35 : 1),t+.08);
    if(duck)gain.linearRampToValueAtTime(this.preferences.musicVolume??.25,t+1.5);
  }
  syncMusic(){
    if(!this.context||this.disposed)return;
    const active=this.preferences.music&&this.musicBuffer&&!this.hidden&&!['title','loading','finished'].includes(this.scene);
    if(!active){this.pauseMusic();return;}
    if(this.context.state!=='running'||this.musicSource)return;
    const source=this.context.createBufferSource(),voice=this.context.createGain(),t=this.context.currentTime;
    voice.gain.setValueAtTime(0,t);voice.gain.linearRampToValueAtTime(1,t+.10);voice.connect(this.musicGain);
    source.buffer=this.musicBuffer;source.loop=true;source.connect(voice);source.voice=voice;
    source.onended=()=>{source.disconnect();voice.disconnect();};
    this.musicStartedAt=this.context.currentTime;source.start(0,this.musicOffset%this.musicBuffer.duration);this.musicSource=source;this.updateMusicGain();
  }
  pauseMusic(){
    const source=this.musicSource;if(!source)return;
    if(!['title','finished'].includes(this.scene))this.musicOffset=(this.musicOffset+this.context.currentTime-this.musicStartedAt)%this.musicBuffer.duration;
    this.musicSource=null;const t=this.context.currentTime;
    source.voice.gain.cancelScheduledValues(t);source.voice.gain.setValueAtTime(source.voice.gain.value,t);source.voice.gain.linearRampToValueAtTime(0,t+.06);source.stop(t+.07);
  }
  play(id,loop=false){if(this.preferences.sound&&!this.disposed){this.sounds.get(id)?.play({loop});if(['clear','lose','notice'].includes(id))this.updateMusicGain(true);}}
  stop(id){this.sounds.get(id)?.stop();}
  stopEffects(){for(const clip of this.sounds.values())clip.stop();}
  stopAll(){this.stopEffects();this.stopVoices();this.pauseMusic();}
  dispose(){if(this.disposed)return;this.disposed=true;this.stopAll();this.sounds.clear();this.voices.clear();this.musicBuffer=null;this.masterGain?.disconnect();this.voiceGain?.disconnect();this.musicGain?.disconnect();this.context?.close().catch(()=>{});this.onChange=()=>{};}
}
