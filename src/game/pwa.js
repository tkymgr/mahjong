import { reactive } from 'vue';
export const pwaState = reactive({production:import.meta.env.PROD,supported:false,offlineReady:false,updateReady:false,installable:false,installed:false,error:false});
let registration=null,installEvent=null,applying=false,started=false;
const BUILD_ID=import.meta.env.PROD?__PWA_BUILD_ID__:'dev';
export function registerPwa(){
 if(started||!import.meta.env.PROD)return;started=true;
 pwaState.supported='serviceWorker' in navigator && window.isSecureContext;
 pwaState.installed=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
 if(!pwaState.supported)return;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;pwaState.installable=true;});
 window.addEventListener('appinstalled',()=>{installEvent=null;pwaState.installable=false;pwaState.installed=true;});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying)location.reload();});
 const run=async()=>{
  try{
   const url=new URL(`${import.meta.env.BASE_URL}sw.js`,document.baseURI);
   registration=await navigator.serviceWorker.register(url,{scope:new URL('./',url).pathname,updateViaCache:'none'});
   const waiting=()=>{pwaState.updateReady=!!registration.waiting;};
   waiting();
   const observe=worker=>{
    if(!worker)return;
    const changed=()=>{if(worker.state==='installed')waiting();if(worker.state==='redundant'&&!registration.active)pwaState.error=true;};
    worker.addEventListener('statechange',changed);changed();
   };
   registration.addEventListener('updatefound',()=>observe(registration.installing));observe(registration.installing);
   await navigator.serviceWorker.ready;pwaState.offlineReady=true;
   registration.active?.postMessage({type:'CLEANUP',buildId:BUILD_ID});
   await registration.update().catch(()=>{});waiting();
  }catch{pwaState.error=true;}
 };
 if(document.readyState==='complete')run();else window.addEventListener('load',run,{once:true});
 window.addEventListener('online',()=>registration?.update().catch(()=>{}));
}
export async function installPwa(){
 if(!installEvent)return;
 const event=installEvent;installEvent=null;pwaState.installable=false;
 try{await event.prompt();await event.userChoice;}catch{/* Browser owns the install prompt. */}
}
export function updatePwa(phase){
 if(!['title','finished'].includes(phase)||!registration?.waiting)return false;
 applying=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});return true;
}
