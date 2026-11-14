import * as pc from 'playcanvas';
import { MahjongSession } from './session.js';
import { TableRenderer } from './renderer.js';
import { GameAudio } from './audio.js';
import { loadPreferences, savePreferences } from './preferences.js';
import { BOARD_WIDTH, BOARD_HEIGHT } from './model-layout.js';

// Vue owns overlays and settings; PlayCanvas owns the actual 3D world.
export function createMahjongGame({canvas,parent,onError=()=>{},onSoundChange=()=>{},onState=()=>{},onView=()=>{}}) {
  const game={engineName:'PlayCanvas',version:pc.version,canvas,app:null,table:null,session:null,audio:null,preferences:loadPreferences(),input:{enabled:true},initialized:false,disposed:false,orientationBlocked:false};
  let observer=null,activePointer=null,pressed=null,gesture=null,started=false;
  let orientationPausedEngine=null;
  const events=[];
  const listen=(target,name,fn,options)=>{target.addEventListener(name,fn,options);events.push(()=>target.removeEventListener(name,fn,options));};
  const coordinates=event=>{const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.x)*BOARD_WIDTH/r.width,y:(event.clientY-r.y)*BOARD_HEIGHT/r.height};};
  const cancel=()=>{activePointer=null;pressed=null;gesture=null;if(game.table){game.table.hover=null;game.table.highlight();}};
  const trackGesture=event=>{
    if(gesture?.touch&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>12)gesture.cancelled=true;
  };
  game.setOrientationBlocked=blocked=>{
    if(game.disposed)return;
    game.orientationBlocked=blocked;cancel();
    game.audio?.setHidden(document.hidden||blocked);
    if(blocked){
      const engine=game.session?.engine;
      if(engine&&!engine.closed&&!engine._stop){engine.stop();orientationPausedEngine=engine;}
    }else if(orientationPausedEngine){
      if(orientationPausedEngine===game.session?.engine&&!orientationPausedEngine.closed)orientationPausedEngine.start();
      orientationPausedEngine=null;
    }
  };
  game.saveSettings=()=>{if(game.session)game.preferences.rules=game.session.rules;savePreferences(game.preferences);};
  game.destroy=()=>{
    if(game.disposed)return;game.disposed=true;observer?.disconnect();for(const off of events)off();
    game.session?.dispose();game.audio?.dispose();game.table?.dispose();game.app?.destroy();
  };
  game.ready=(async()=>{
    try{
      const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'},devtools:false});
      game.app=app;app.graphicsDevice.maxPixelRatio=Math.min(window.devicePixelRatio||1,1.5);app.autoRender=false;
      app.setCanvasResolution(pc.RESOLUTION_AUTO);app.setCanvasFillMode(pc.FILLMODE_NONE);
      const resize=()=>{if(game.disposed)return;const r=parent.getBoundingClientRect();app.resizeCanvas(Math.max(1,Math.round(r.width)),Math.max(1,Math.round(r.height)));game.table?.resize();};
      observer=new ResizeObserver(resize);observer.observe(parent);resize();
      game.audio=new GameAudio(game.preferences,state=>{onSoundChange(state);savePreferences(game.preferences);});
      game.session=new MahjongSession({rules:game.preferences.rules,preferences:game.preferences,audio:game.audio,onChange:state=>{if(game.disposed)return;game.audio?.setScene(state.phase);if(game.table)game.table.dirty=true;onState(state);}});
      game.table=new TableRenderer(app,game.session,{onView});
      await Promise.all([game.table.load(import.meta.env.BASE_URL),game.audio.load(import.meta.env.BASE_URL)]);
      if(game.disposed)return game;
      canvas.style.width='100%';canvas.style.height='100%';resize();
      app.on('update',()=>{
        if(game.disposed)return;
        const speech=game.session.speech;
        if(speech&&speech.until<Date.now()){game.session.speech=null;game.session.publish();}
        if(game.table.dirty)game.table.draw();
      });
      listen(canvas,'pointerdown',event=>{
        if(!game.input.enabled||game.orientationBlocked||activePointer!==null||event.button!==0||event.isPrimary===false)return;
        game.audio.unlock();activePointer=event.pointerId;
        const p=coordinates(event),r=canvas.getBoundingClientRect(),touch=event.pointerType==='touch'||event.pointerType==='pen';
        pressed=game.table.hit(p.x,p.y,touch?{x:6*BOARD_WIDTH/r.width,y:6*BOARD_HEIGHT/r.height}:undefined)?.id||null;
        gesture={touch,x:event.clientX,y:event.clientY,cancelled:false,pending:game.session.pending};
        game.table.hover=pressed;game.table.highlight();
        canvas.setPointerCapture?.(event.pointerId);
      });
      listen(canvas,'pointermove',event=>{
        if(!game.input.enabled||game.orientationBlocked||(activePointer!==null&&activePointer!==event.pointerId))return;
        if(gesture?.touch){trackGesture(event);game.table.hover=gesture.cancelled?null:pressed;game.table.highlight();}
        else if(event.pointerType!=='touch'){const p=coordinates(event);game.table.move(p.x,p.y);}
      });
      listen(canvas,'pointerup',event=>{
        if(activePointer!==event.pointerId)return;
        trackGesture(event);
        const p=coordinates(event),id=gesture?.touch?(!gesture.cancelled?pressed:null):game.table.hit(p.x,p.y)?.id;
        if(game.input.enabled&&!game.orientationBlocked&&pressed&&id===pressed&&gesture?.pending===game.session.pending)game.table.activate(id);
        if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);
        cancel();
      });
      listen(canvas,'pointercancel',cancel);listen(canvas,'lostpointercapture',cancel);listen(window,'blur',cancel);
      listen(document,'visibilitychange',()=>game.audio.setHidden(document.hidden||game.orientationBlocked));
      game.audio.setHidden(document.hidden||game.orientationBlocked);
      listen(canvas,'keydown',event=>{if(!game.input.enabled||game.orientationBlocked||!['ArrowLeft','ArrowRight','Enter',' '].includes(event.key))return;event.preventDefault();game.audio.unlock();game.table.keyboard(event.key);});
      app.start();started=true;game.initialized=true;game.session.publish();game.table.draw();return game;
    }catch(error){
      if(!game.disposed){console.error(error);onError(error);}
      if(!started){observer?.disconnect();game.table?.dispose();game.audio?.dispose();game.session?.dispose();game.app?.destroy();game.app=null;}
      return game;
    }
  })();
  return game;
}
