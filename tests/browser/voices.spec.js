import {test,expect} from '@playwright/test';
import {ready,start,openMenu,closeMenu} from './helpers.js';
import {CHARACTERS} from '../../src/game/characters.js';

test('nine distinct character auditions produce voice audio independently of effects',async({page})=>{
 await ready(page);await openMenu(page,'characters');
 expect(await page.evaluate(()=>window.mahjongGame.audio.voices.size)).toBe(60);
 await page.evaluate(()=>window.mahjongGame.audio.setEnabled(false));
 for(const c of CHARACTERS){
  await page.getByRole('button',{name:`${c.name}の声を試聴`,exact:true}).click();
  await page.waitForFunction(id=>{const a=window.mahjongGame.audio;return a.voiceSource?.buffer===a.voices.get(`${id}:zimo`);},c.id);
  const result=await page.evaluate(async id=>{
   const a=window.mahjongGame.audio,analyser=a.context.createAnalyser();analyser.fftSize=2048;a.voiceGain.connect(analyser);
   const correct=a.voiceSource?.buffer===a.voices.get(`${id}:zimo`);let peak=0;
   for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,8));const data=new Float32Array(2048);analyser.getFloatTimeDomainData(data);for(const v of data)peak=Math.max(peak,Math.abs(v));}
   a.voiceGain.disconnect(analyser);analyser.disconnect();return {correct,peak};
  },c.id);
  expect(result.correct,c.id).toBe(true);expect(result.peak,c.id).toBeGreaterThan(.002);expect(result.peak).toBeLessThan(.7);
 }
 await page.evaluate(()=>{const a=window.mahjongGame.audio;a.stopVoices();a.voiceHistory=[];a.speak('hinata','rong');a.speak('ponta','rong');});
 await page.waitForFunction(()=>{const a=window.mahjongGame.audio;return !a.voiceSource&&!a.voiceQueue.length;});
 expect(await page.evaluate(()=>window.mahjongGame.audio.voiceHistory)).toEqual([{id:'hinata',action:'rong'},{id:'ponta',action:'rong'}]);
});

test('voice settings persist and core declarations keep their character after seat rotation',async({page})=>{
 await ready(page);await start(page);
 const result=await page.evaluate(characters=>{
  const g=window.mahjongGame,s=g.session,a=g.audio;s.engine.dispose();s.opponents=characters;s.model.player_id=[2,3,0,1];a.voiceHistory=[];
  for(const action of ['zimo','rong','peng','chi','gang','lizhi']){a.stopVoices();s.announce(action,0);}
  a.stopVoices();s.announce('rong',2);
  const calls=[...a.voiceHistory];a.setHidden(true);const stopped=!a.voiceSource&&!a.voiceQueue.length;a.setHidden(false);
  return {calls,stopped};
 },CHARACTERS.slice(0,3));
 expect(result.calls).toEqual([...['zimo','rong','peng','chi','gang','lizhi'].map(action=>({id:CHARACTERS[1].id,action})),{id:'player',action:'rong'}]);expect(result.stopped).toBe(true);
 await openMenu(page);await page.locator('#voice-volume').evaluate(el=>{el.value='42';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#voice-toggle').click();
 await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
 await page.reload();await page.waitForSelector('#start-game');await openMenu(page);
 await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#voice-volume')).toHaveValue('42');
});

test('missing voice assets do not block a match and declarations retain their sound cue',async({page})=>{
 await page.route('**/voices/**/*.mp3',route=>route.abort());await ready(page);await openMenu(page);
 await expect(page.locator('#voice-toggle')).toBeDisabled();await closeMenu(page);await start(page);
 const result=await page.evaluate(()=>{const s=window.mahjongGame.session;s.announce('peng',s.humanSeat);return window.mahjongGame.audio.sounds.get('puyo').isPlaying;});
 expect(result).toBe(true);
});
