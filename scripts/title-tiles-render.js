import * as pc from 'playcanvas';
import {TableRenderer} from '../src/game/renderer.js';
import {TILE} from '../src/game/model-layout.js';
import layout from '../assets/title/title-tiles-layout.json';

const [width,height]=layout.referenceSize,canvas=document.querySelector('#title-tiles');
canvas.width=width*layout.oversampling;canvas.height=height*layout.oversampling;
canvas.style.width=width+'px';canvas.style.height=height+'px';
const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:true,antialias:true,preserveDrawingBuffer:true},devtools:false});
app.autoRender=false;app.graphicsDevice.maxPixelRatio=1;
app.setCanvasResolution(pc.RESOLUTION_FIXED,canvas.width,canvas.height);
const session={model:null,opponents:[],humanSeat:0,legalDiscards:()=>[]};
const renderer=new TableRenderer(app,session);
await renderer.load('/');
for(const entity of app.root.children)if(![renderer.camera,renderer.light,renderer.group].includes(entity))entity.enabled=false;
renderer.camera.camera.fov=layout.camera.horizontalFov;
renderer.camera.setPosition(0,layout.camera.heightMm,0);renderer.camera.lookAt(0,layout.camera.heightMm,-1000);
app.scene.ambientLight=new pc.Color(.55,.52,.46);
renderer.light.light.color=new pc.Color(1,.93,.80);renderer.light.light.intensity=1;
renderer.light.light.shadowResolution=4096;renderer.light.light.shadowDistance=2500;
renderer.light.light.normalOffsetBias=.05;renderer.light.light.shadowBias=.02;
renderer.light.setEulerAngles(45,-30,0);
const groundMaterial=new pc.StandardMaterial();groundMaterial.diffuse=new pc.Color(.2,.35,.24);groundMaterial.gloss=0;groundMaterial.update();
const ground=renderer.box('Title shadow receiver',[4000,.2,5000],[0,-.2,-2500],groundMaterial);
ground.render.castShadows=false;
const focal=width/(2*Math.tan(layout.camera.horizontalFov*Math.PI/360));
const scale=layout.tileDimensionsMm[0]/TILE.width;
const project=point=>renderer.camera.camera.worldToScreen(point,new pc.Vec3(),width,height);
function positionOnTable([x,y],worldY=0){const depth=focal*(layout.camera.heightMm-worldY)/(y-height/2);return {x:(x-width/2)*depth/focal,z:-depth};}
function add(code,position,options={}){
  const tile=renderer.tile(code,position,{kind:'title',scale,...options});
  if(options.held){tile.entity.render.castShadows=false;tile.meshInstances[2].material=renderer.flatFaceMaterials.get(code);}
  return tile;
}
const back=layout.backHand,p=positionOnTable(back.center);
for(let i=0;i<back.count;i++)add('m1',{x:p.x+(i-(back.count-1)/2)*back.pitchMm,z:p.z},{yaw:180,hidden:true});
for(const wall of [layout.leftWall,layout.rightWall]){
  const start=positionOnTable(wall.start),radians=wall.yaw*Math.PI/180;
  for(let i=0;i<wall.stacks;i++)for(let layer=0;layer<2;layer++)add('m1',{x:start.x+i*wall.pitchMm*Math.cos(radians),z:start.z-i*wall.pitchMm*Math.sin(radians),layer:layer*layout.tileDimensionsMm[2]},{yaw:wall.yaw,flat:true,faceDown:true,hidden:true});
}
for(const tile of layout.discards)add(tile.code,positionOnTable(tile.center,layout.tileDimensionsMm[2]/2),{yaw:tile.yaw,flat:true});
const held=layout.heldTile,k=(held.center[0]-width/2)/focal;
const targetWidth=layout.tileDimensionsMm[0]/held.fingerWidthMm*held.fingerWidthPixels;
const depth=focal*layout.tileDimensionsMm[0]*Math.sqrt(1+k*k)/targetWidth;
add(held.code,{x:k*depth,z:-depth,layer:layout.camera.heightMm-(held.center[1]-height/2)*depth/focal-layout.tileDimensionsMm[1]/2},{yaw:-Math.atan(k)*180/Math.PI,held:true});
app.start();
async function frame(){app.renderNextFrame=true;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
await frame();
window.titleAuthoring={
  async capture(pass){ground.enabled=pass!=='tiles';renderer.group.enabled=pass!=='plane';await frame();return canvas.toDataURL('image/png');},
  metrics(){return {tileDimensionsMm:layout.tileDimensionsMm,renderSize:[canvas.width,canvas.height],referenceSize:layout.referenceSize,tileCount:renderer.tiles.length,tiles:renderer.tiles.map(tile=>{const corners=[];for(const x of [-TILE.width/2,TILE.width/2])for(const y of [-TILE.height/2,TILE.height/2])for(const z of [-TILE.depth/2,TILE.depth/2])corners.push(project(tile.entity.getWorldTransform().transformPoint(new pc.Vec3(x,y,z))));return {dimensionsMm:tile.entity.getLocalScale().toArray().map((s,index)=>s*[TILE.width,TILE.height,TILE.depth][index]),code:tile.code,flat:tile.flat,hidden:tile.hidden,positionMm:tile.entity.getPosition().toArray(),bounds:{x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),width:Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height:Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))}};})};}
};
