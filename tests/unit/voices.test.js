import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Majiang from '@kobalab/majiang-core';
import {MahjongSession} from '../../src/game/session.js';
import {CHARACTERS} from '../../src/game/characters.js';
import {VOICE_IDS,VOICE_ACTIONS} from '../../src/game/voices.js';
import {loadPreferences} from '../../src/game/preferences.js';

function fixture(accept=true){
 const calls=[],effects=[],s=new MahjongSession({audio:{speak:(...args)=>{calls.push(args);return accept;},play:id=>effects.push(id)}});
 s.opponents=CHARACTERS.slice(0,3);s.engine={model:{player_id:[2,3,0,1],defen:[25000,25000,25000,25000],shoupai:Array.from({length:4},()=>Majiang.Shoupai.fromString('m123456p123s789z1'))}};
 return {s,calls,effects};
}

test('announcements select a character by fixed ID after seat rotation, including the human voice',()=>{
 const {s,calls,effects}=fixture();
 for(const name of Object.keys(VOICE_ACTIONS))s.announce(name,0);
 assert.deepEqual(calls,Object.keys(VOICE_ACTIONS).map(name=>[CHARACTERS[1].id,name]));
 assert.equal(s.speech.id,2);assert.equal(effects.length,0);
 s.announce('rong',2);assert.deepEqual(calls.at(-1),['player','rong']);assert.equal(s.speech.id,0);
});

test('disabled or unavailable speech retains the chime and disposed sessions stay silent',()=>{
 const {s,calls,effects}=fixture(false);s.announce('chi',3);
 assert.deepEqual(calls,[[CHARACTERS[0].id,'chi']]);assert.deepEqual(effects,['puyo']);
 s.disposed=true;s.announce('rong',0);assert.equal(calls.length,1);assert.equal(effects.length,1);
});

test('an abandoned engine cannot announce through a replacement session',()=>{
 const calls=[],s=new MahjongSession({audio:{speak:(...args)=>{calls.push(args);return true;},play:()=>{}}});
 try{s.start();const old=s.engine;s.start();old.view.say('rong',0);assert.equal(calls.length,0);s.engine.view.say('peng',0);assert.equal(calls.length,1);}finally{s.dispose();}
});

test('voice preferences respect a previous mute and save independent volume limits',()=>{
 const storage=value=>({getItem:key=>key==='mahjong.preferences.v2'?JSON.stringify(value):null});
 assert.equal(loadPreferences(storage({sound:false})).voice,false);
 assert.equal(loadPreferences(storage({sound:false,voice:true})).voice,true);
 assert.equal(loadPreferences(storage({voiceVolume:2})).voiceVolume,1);
 assert.equal(loadPreferences(storage({voiceVolume:-1})).voiceVolume,0);
 assert.equal(loadPreferences(storage({voiceVolume:'loud'})).voiceVolume,.8);
});

test('all ten voices have every declaration as distinct, verified distributable assets',()=>{
 const catalogue=JSON.parse(readFileSync('assets/voices/catalogue.json','utf8')),keys=new Set(),hashes=new Set();
 assert.equal(catalogue.clips.length,VOICE_IDS.length*Object.keys(VOICE_ACTIONS).length);
 for(const clip of catalogue.clips){
  assert.ok(VOICE_IDS.includes(clip.id));assert.ok(VOICE_ACTIONS[clip.action]);
  const key=`${clip.id}:${clip.action}`;assert.ok(!keys.has(key));keys.add(key);
  const hash=createHash('sha256').update(readFileSync(clip.file)).digest('hex');assert.equal(hash,clip.sha256);hashes.add(hash);
  assert.ok(clip.duration>.15&&clip.duration<2.5,key);assert.ok(clip.peak<=.461,key);
 }
 assert.equal(hashes.size,catalogue.clips.length);
});

test('a new deal clears the previous announcement and stops queued speech',()=>{
 const {s}=fixture();let stopped=0;s.audio.stopVoices=()=>{stopped++;};
 s.announce('rong',0);assert.ok(s.speech);
 s.handleEvent('qipai');assert.equal(s.speech,null);assert.equal(stopped,1);
});
