import * as pc from 'playcanvas';
import { characterAppearance } from './characterAppearance.js';
import { handTiles, meldTiles } from './tiles.js';
import { TILE, TABLE, CAMERA, PLAYER_HAND, HAND_DISTANCE, WORLD_TILE_SCALE, RIVER_SCALE, BOARD_WIDTH, BOARD_HEIGHT, faceFile, TILE_CODES, seatPosition, riverPosition } from './model-layout.js';

function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error(`Image load failed: ${url}`));image.src=url;});}
function makeMesh(device,positions,attributes){const geometry=new pc.Geometry();Object.assign(geometry,{positions,...attributes});return pc.Mesh.fromGeometry(device,geometry);}
function material(color, gloss=.3){const m=new pc.StandardMaterial();m.diffuse=new pc.Color(...color);m.useMetalness=true;m.metalness=0;m.gloss=gloss;m.update();return m;}

export class TableRenderer {
  constructor(app,session,{onView=()=>{}}={}) {
    this.app=app;this.session=session;this.device=app.graphicsDevice;this.onView=onView;
    this.dirty=true;this.hover=null;this.keyboardIndex=0;this.tiles=[];this.hits=[];this.disposed=false;
    this.textures=[];this.materials=[];this.meshes=[];this.faceMaterials=new Map();this.flatFaceMaterials=new Map();this.selectedFaceMaterials=new Map();
    this.camera=new pc.Entity('Shared perspective camera');this.camera.addComponent('camera',{clearColor:new pc.Color(0,0,0,0),fov:CAMERA.horizontalFov,horizontalFov:true,nearClip:10,farClip:4000});
    this.camera.setPosition(...CAMERA.position);this.camera.lookAt(...CAMERA.target);app.root.addChild(this.camera);
    this.handLayer=new pc.Layer({name:'Frontal player hand'});app.scene.layers.push(this.handLayer);
    this.handCamera=new pc.Entity('Player hand orthographic camera');
    this.handCamera.addComponent('camera',{projection:pc.PROJECTION_ORTHOGRAPHIC,priority:10,clearColorBuffer:false,clearDepthBuffer:true,layers:[this.handLayer.id],nearClip:1,farClip:2000});
    this.handCamera.setPosition(0,0,1000);this.handCamera.lookAt(0,0,0);app.root.addChild(this.handCamera);
    this.handLight=new pc.Entity('Player hand key light');this.handLight.addComponent('light',{type:'directional',color:new pc.Color(1,.97,.89),intensity:.9,castShadows:false,layers:[this.handLayer.id]});this.handLight.setEulerAngles(45,-25,0);app.root.addChild(this.handLight);
    this.handFillLight=new pc.Entity('Player hand fill light');this.handFillLight.addComponent('light',{type:'directional',color:new pc.Color(1,.98,.95),intensity:.5,castShadows:false,layers:[this.handLayer.id]});this.handFillLight.setEulerAngles(115,30,0);app.root.addChild(this.handFillLight);
    app.scene.ambientLight=new pc.Color(.47,.49,.46);
    const sun=new pc.Entity('Key light');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.96,.87),intensity:1.15,castShadows:true,shadowDistance:3000,shadowResolution:2048,shadowType:pc.SHADOW_PCF3,normalOffsetBias:.5,shadowBias:.35,shadowIntensity:.45});
    sun.setEulerAngles(20,35,0);app.root.addChild(sun);this.light=sun;
    this.group=new pc.Entity('Tiles');app.root.addChild(this.group);
    this.white=material([.94,.91,.82],.42);this.back=material([.84,.48,.045],.42);this.selected=material([1,.94,.62],.55);
    this.flatWhite=material([.80,.78,.70],.06);this.flatWhite.useMetalness=false;this.flatWhite.specular=new pc.Color(0,0,0);this.flatWhite.update();
    // A small lighting floor keeps the foreground bevels from turning charcoal.
    this.handIvory=this.white.clone();this.handIvory.gloss=.28;this.handIvory.useMetalness=false;this.handIvory.specular=new pc.Color(.12,.12,.10);this.handIvory.emissive=new pc.Color(.42,.40,.34);this.handIvory.update();
    this.handBack=this.back.clone();this.handBack.gloss=.28;this.handBack.emissive=new pc.Color(.24,.12,.02);this.handBack.update();
    this.handSelected=this.handIvory.clone();this.handSelected.diffuse=new pc.Color(1,.94,.62);this.handSelected.update();
    this.materials.push(this.white,this.back,this.selected,this.flatWhite,this.handIvory,this.handBack,this.handSelected);
  }
  async load(base) {
    const response=await fetch(`${base}models/mahjong-tile.json`);if(!response.ok)throw Error('Tile model missing');this.model=await response.json();
    const [felt,...faces]=await Promise.all([loadImage(`${base}js/bg.png`),...TILE_CODES.map(code=>loadImage(`${base}js/faces/${faceFile(code)}`))]);
    if(this.disposed)return;
    for(const [key,data] of Object.entries(this.model.meshes)){const mesh=makeMesh(this.device,data.positions,{normals:data.normals,indices:data.indices});mesh.incRefCount();this.meshes.push(mesh);this[key+'Mesh']=mesh;}
    this.glyphMesh=makeMesh(this.device,[-TILE.width*.44,-TILE.height*.44,TILE.depth/2+.09,TILE.width*.44,-TILE.height*.44,TILE.depth/2+.09,TILE.width*.44,TILE.height*.44,TILE.depth/2+.09,-TILE.width*.44,TILE.height*.44,TILE.depth/2+.09],{normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]});this.glyphMesh.incRefCount();this.meshes.push(this.glyphMesh);
    TILE_CODES.forEach((code,i)=>{
      const texture=this.texture(faces[i]);const m=material([1,1,1],.25);m.useLighting=false;m.useSkybox=false;m.diffuse=new pc.Color(0,0,0);m.emissive=new pc.Color(1,1,1);m.emissiveMap=texture;m.opacityMap=texture;m.opacityMapChannel='a';m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;m.alphaTest=.025;m.cull=pc.CULLFACE_BACK;m.update();this.materials.push(m);this.faceMaterials.set(code,m);
      // Composite ink onto an opaque ivory face before mipmapping. A separate
      // matte material keeps the flat faces free of specular washout.
      const canvas=document.createElement('canvas');canvas.width=faces[i].width;canvas.height=faces[i].height;
      const c=canvas.getContext('2d');c.drawImage(faces[i],0,0);const image=c.getImageData(0,0,canvas.width,canvas.height);
      for(let j=0;j<image.data.length;j+=4){const a=(image.data[j+3]/255)**.8;for(let channel=0;channel<3;channel++)image.data[j+channel]=Math.round(image.data[j+channel]*a+[230,224,207][channel]*(1-a));image.data[j+3]=255;}
      c.putImageData(image,0,0);
      const flat=material([0,0,0],0);flat.useLighting=false;flat.useSkybox=false;flat.emissive=new pc.Color(1,1,1);flat.emissiveMap=this.texture(canvas);flat.blendType=pc.BLEND_NORMAL;flat.depthWrite=false;flat.cull=pc.CULLFACE_BACK;flat.update();this.materials.push(flat);this.flatFaceMaterials.set(code,flat);
      const selected=flat.clone();selected.emissive=new pc.Color(1.12,1.04,.75);selected.update();this.materials.push(selected);this.selectedFaceMaterials.set(code,selected);
    });
    this.buildTable(felt);this.buildMarker();this.ready=true;this.draw();
  }
  texture(image){const t=new pc.Texture(this.device,{mipmaps:true,anisotropy:Math.min(8,this.device.maxAnisotropy),minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE,srgb:true,flipY:true});t.setSource(image);this.textures.push(t);return t;}
  box(name,size,position,mat){const entity=new pc.Entity(name);entity.addComponent('render',{type:'box',material:mat,castShadows:true,receiveShadows:true});entity.setLocalScale(...size);entity.setPosition(...position);this.app.root.addChild(entity);return entity;}
  buildTable(image){
    const felt=material([.40,.62,.43],.12);felt.diffuseMap=this.texture(image);felt.update();
    const wood=material([.12,.075,.038],.25),trim=material([.47,.37,.16],.5);this.materials.push(felt,wood,trim);
    const depth=TABLE.depth+TABLE.foregroundExtension,center=TABLE.centerZ+TABLE.foregroundExtension/2;
    this.box('Felt surface',[TABLE.width,4,depth],[0,-2,center],felt);
    for(const x of [-1,1]){this.box('Side rail',[24,18,depth+48],[x*(TABLE.width/2+12),-6,center],wood);this.box('Side bevel',[3,4,depth+12],[x*(TABLE.width/2+1.5),2,center],trim);}
    this.box('Rear rail',[TABLE.width+48,18,24],[0,-6,TABLE.centerZ-TABLE.depth/2-12],wood);
    this.buildStation();
  }
  buildStation(){
    const rim=material([.15,.18,.19],.45);this.materials.push(rim);
    this.stationBody=this.box('Automatic table score unit',[232,7,232],[0,3.5,0],rim);
    this.stationCanvas=document.createElement('canvas');this.stationCanvas.width=this.stationCanvas.height=768;
    this.stationTexture=this.texture(this.stationCanvas);
    this.stationTexture.anisotropy=Math.min(8,this.device.maxAnisotropy);
    const display=new pc.StandardMaterial();display.useLighting=false;display.useSkybox=false;display.diffuse=new pc.Color(0,0,0);display.emissive=new pc.Color(1,1,1);display.emissiveMap=this.stationTexture;display.update();this.materials.push(display);
    const mesh=makeMesh(this.device,[-113,-113,0,113,-113,0,113,113,0,-113,113,0],{normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]});mesh.incRefCount();this.meshes.push(mesh);
    this.stationDisplay=new pc.Entity('Four seat LCD displays');this.stationDisplay.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,display)],castShadows:false,receiveShadows:false});this.stationDisplay.setEulerAngles(-90,0,0);this.stationDisplay.setPosition(0,9,0);this.app.root.addChild(this.stationDisplay);
  }
  updateStation(playing){
    this.stationBody.enabled=this.stationDisplay.enabled=playing;
    if(!playing)return;
    const m=this.session.model;
    this.stationState={round:`${['東','南','西','北'][m.zhuangfeng]}${'一二三四'[m.jushu]}局`,honba:m.changbang,deposits:m.lizhibang,remaining:m.shan.paishu,players:[0,1,2,3].map(id=>({id,name:this.session.name(id),wind:['東','南','西','北'][m.player_id.indexOf(id)],points:m.defen[id],riichi:!!m.shoupai[m.player_id.indexOf(id)]?.lizhi}))};
    const c=this.stationCanvas.getContext('2d');c.clearRect(0,0,768,768);c.fillStyle='#12191c';c.fillRect(0,0,768,768);c.strokeStyle='#596469';c.lineWidth=5;c.strokeRect(7,7,754,754);
    c.textAlign='center';c.textBaseline='middle';
    for(const p of this.stationState.players){
      c.save();c.translate(384,384);c.rotate(-p.id*Math.PI/2);
      c.fillStyle=p.id===0?'#123646':'#080f12';c.fillRect(-224,244,448,108);c.strokeStyle=p.id===0?'#4aa6bb':'#5c6b70';c.lineWidth=3;c.strokeRect(-224,244,448,108);
      c.fillStyle=p.wind==='東'?'#b44938':'#315e66';c.fillRect(-212,255,82,85);c.fillStyle='#fff4d5';c.font='bold 64px sans-serif';c.fillText(p.wind,-171,299);
      const points=p.points.toLocaleString('en-US'),fontSize=Math.min(76,300/(points.length*.6));
      c.fillStyle=p.id===0?'#9ae9f6':'#ffe39b';c.font=`bold ${fontSize}px monospace`;c.fillText(points,42,300);
      c.fillStyle=p.riichi?'#ffb64d':'#29343a';c.fillRect(-108,335,306,7);c.restore();
    }
    c.fillStyle='#233137';c.fillRect(171,171,426,426);c.strokeStyle='#667277';c.strokeRect(171,171,426,426);
    c.fillStyle='#e8d9ac';c.font='bold 88px sans-serif';c.fillText(this.stationState.round,384,291);
    c.fillStyle='#88dbe7';c.font='44px sans-serif';c.fillText(`${m.changbang}本場 · 供託 ${m.lizhibang}本`,384,390);
    c.fillStyle='#ecf1e6';c.font='bold 64px sans-serif';c.fillText(`残り ${m.shan.paishu}枚`,384,475);
    this.stationTexture.upload();
  }
  buildMarker(){
    const root=new pc.Entity('Thin dealer marker');this.app.root.addChild(root);
    const plate=new pc.Entity('Amber plate');plate.addComponent('render',{type:'box',material:this.back,castShadows:true,receiveShadows:false});plate.setLocalScale(90,2,34);plate.setLocalPosition(0,1,0);root.addChild(plate);
    const mesh=makeMesh(this.device,[-14,-14,0,14,-14,0,14,14,0,-14,14,0],{normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]});mesh.incRefCount();this.meshes.push(mesh);
    const label=new pc.Entity('East / South');label.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,this.faceMaterials.get('z1'))],castShadows:false,receiveShadows:false});label.setLocalEulerAngles(-90,0,0);label.setLocalPosition(0,2.1,0);root.addChild(label);
    this.marker=root;this.markerLabel=label;
  }
  tile(code,position,{player=0,kind='hand',yaw=0,roll=0,flat=false,faceDown=false,hidden=false,scale=1,index=null,drawn=false,screenSpace=false,winning=false}={}) {
    const entity=new pc.Entity(`${kind}-${player}-${index??this.tiles.length}`);this.group.addChild(entity);
    const meshInstances=[new pc.MeshInstance(this.ivoryMesh,screenSpace?this.handIvory:flat?this.flatWhite:this.white),new pc.MeshInstance(this.backMesh,screenSpace?this.handBack:this.back)];
    if(!hidden&&(code!=='z5'||flat||screenSpace))meshInstances.push(new pc.MeshInstance(this.glyphMesh,((flat||screenSpace)?this.flatFaceMaterials:this.faceMaterials).get(code)));
    entity.addComponent('render',{meshInstances,castShadows:!screenSpace,receiveShadows:false,layers:screenSpace?[this.handLayer.id]:[pc.LAYERID_WORLD]});
    // Orient local +Z towards each player's face. Flat tiles turn the same
    // model onto its back: no separately painted left/right views are used.
    let rotation=new pc.Quat().setFromEulerAngles(flat?(faceDown?90:-90):0,yaw,roll);
    if(screenSpace)rotation=new pc.Quat().setFromEulerAngles(PLAYER_HAND.pitch,0,0).mul(rotation);
    entity.setLocalRotation(rotation);entity.setLocalScale(scale,scale,scale);
    const height=screenSpace
      ? (Math.abs(rotation.transformVector(new pc.Vec3(1,0,0)).y)*TILE.width+Math.abs(rotation.transformVector(new pc.Vec3(0,1,0)).y)*TILE.height+Math.abs(rotation.transformVector(new pc.Vec3(0,0,1)).y)*TILE.depth)*scale
      : (flat?TILE.depth:TILE.height)*scale;
    entity.setPosition(position.x,height/2+(position.layer||0),position.z);
    const entry={entity,code:hidden?null:code,player,kind,index,drawn,winning,flat,faceDown,hidden,scale,yaw,roll,screenSpace,position:{x:position.x,y:height/2+(position.layer||0),z:position.z},height,contactY:position.layer||0,meshInstances};
    this.tiles.push(entry);
    if(kind==='hand'&&player===0&&index!==null){
      const legal=this.session.legalDiscards().some(p=>p.slice(0,2)===code);
      if(legal){entry.id=`hand-${index}`;entry.tile=code;this.hits.push(entry);}
    }
    return entry;
  }
  playerHand(cards,melds,revealAll=false){
    const aspect=this.device.width/this.device.height;
    this.handCamera.camera.orthoHeight=BOARD_WIDTH/aspect/2;
    const closed=cards.length*TILE.pitch*PLAYER_HAND.scale+(cards.some(c=>c.drawn)?14*PLAYER_HAND.scale:0);
    const open=melds.reduce((sum,meld)=>sum+16+meld.reduce((n,c)=>n+((c.called?TILE.height:TILE.width)+2)*PLAYER_HAND.meldScale,0),0);
    const fit=Math.min(1,BOARD_WIDTH*PLAYER_HAND.maxWidth/(closed+open));
    const handScale=PLAYER_HAND.scale*fit,meldScale=PLAYER_HAND.meldScale*fit;
    const baseline=-this.handCamera.camera.orthoHeight+2*this.handCamera.camera.orthoHeight*PLAYER_HAND.bottom/BOARD_HEIGHT;
    let x=-(closed+open)*fit/2;
    cards.forEach((card,index)=>{
      if(card.drawn)x+=14*handScale;
      this.tile(card.tile,{x:x+TILE.width*handScale/2,z:0,layer:baseline},{player:0,index,drawn:card.drawn,winning:this.session.result?.type==='hule'&&this.session.result.winnerId===0&&card.drawn,scale:handScale,screenSpace:true});
      x+=TILE.pitch*handScale;
    });
    for(const meld of melds){x+=16*fit;for(const card of meld){
      const width=(card.called?TILE.height:TILE.width)*meldScale;
      const back=card.back&&!revealAll;
      this.tile(card.tile,{x:x+width/2,z:0,layer:baseline},{player:0,kind:'meld',hidden:back,faceDown:back,yaw:back?180:0,roll:card.called?90:0,scale:meldScale,screenSpace:true});
      x+=width+2*meldScale;
    }}
  }
  hands(){
    const model=this.session.model;
    for(const id of [2,3,1,0]){
      const seat=model.player_id.indexOf(id),hand=this.session.revealedHands.get(seat)||model.shoupai[seat];if(!hand)continue;
      const visible=id===0||this.session.revealed.has(seat),cards=handTiles(hand);
      // The first call stays at the player's right; later groups extend left.
      // Reverse only the display groups, preserving called-tile orientation and core history.
      const melds=hand._fulou.slice().reverse().map(m=>meldTiles(m));
      const revealAll=this.session.result?.type==='pingju';
      if(id===0){this.playerHand(cards,melds,revealAll);continue;}
      const scale=WORLD_TILE_SCALE;
      const closedSpan=(cards.length*TILE.pitch+(cards.some(c=>c.drawn)?14:0))*scale;
      const meldSpan=melds.reduce((s,m)=>s+m.reduce((n,c)=>n+((c.called?TILE.height:TILE.width)+2)*scale,0)+12*scale,0);
      const span=closedSpan+meldSpan;let distance=-span/2+TILE.width*scale/2;
      cards.forEach((card,index)=>{
        if(card.drawn)distance+=14*scale;
        const p=seatPosition(id,distance,id===0?370:id===2?420:HAND_DISTANCE);
        this.tile(card.tile,p,{player:id,yaw:p.yaw,hidden:!visible,flat:this.session.revealed.has(seat),index:null,drawn:card.drawn,winning:this.session.result?.type==='hule'&&this.session.result.winnerId===id&&card.drawn,scale});distance+=TILE.pitch*scale;
      });
      for(const meld of melds){distance+=12*scale;for(const card of meld){
        const width=(card.called?TILE.height:TILE.width)*scale;
        const p=seatPosition(id,distance+(width-TILE.width*scale)/2,id===2?420:HAND_DISTANCE);
        const back=card.back&&!revealAll;
        this.tile(card.tile,p,{player:id,yaw:p.yaw+(card.called?90:0),kind:'meld',flat:true,faceDown:back,hidden:back,scale});distance+=width+2*scale;
      }}
    }
  }
  rivers(){
    const model=this.session.model;
    const longest=Math.max(...model.he.map(h=>h._pai.filter(p=>!/[+=-]$/.test(p)).length));
    const scale=longest>18?.55:RIVER_SCALE;
    for(let id=0;id<4;id++){
      const river=model.he[model.player_id.indexOf(id)]._pai.filter(p=>!/[+=-]$/.test(p));
      river.forEach((code,index)=>{
        const row=Math.floor(index/6),col=index%6,sideways=code.includes('*'),previous=river.slice(row*6,index).some(p=>p.includes('*'));
        const p=riverPosition(id,row,col,sideways,previous,scale);
        this.tile(code.slice(0,2),p,{kind:'river',player:id,flat:true,yaw:p.yaw,scale,index});
      });
    }
  }
  wall(){
    const dora=this.session.model.shan?.baopai||[];
    for(let i=0;i<5;i++){
      const p={x:-310+i*TILE.pitch*WORLD_TILE_SCALE,z:-190};
      this.tile('m1',p,{kind:'wall',flat:true,faceDown:true,hidden:true,scale:WORLD_TILE_SCALE});
      this.tile(dora[i]||'m1',{...p,layer:TILE.depth*WORLD_TILE_SCALE},{kind:'wall',flat:true,faceDown:!dora[i],hidden:!dora[i],scale:WORLD_TILE_SCALE});
    }
  }
  clearTiles(){for(const tile of this.tiles)tile.entity.destroy();this.tiles=[];this.hits=[];}
  draw(){
    if(this.disposed||!this.ready)return;
    this.clearTiles();
    const playing=!!this.session.model?.shan&&this.session.phase!=='title';
    this.handCamera.enabled=playing;
    this.updateStation(playing);
    if(this.marker){this.marker.enabled=playing;if(playing){const p=seatPosition(this.session.model.qijia,270,230);this.marker.setPosition(p.x,0,p.z);this.marker.setEulerAngles(0,p.yaw,0);this.markerLabel.render.meshInstances[0].material=this.faceMaterials.get(this.session.model.zhuangfeng>0?'z2':'z1');}}
    if(playing){this.wall();this.rivers();this.hands();}
    this.updateBounds();this.highlight();this.dirty=false;this.app.renderNextFrame=true;
    const model=this.session.model;
    const winning=this.tiles.find(tile=>tile.winning);
    this.onView({winningTile:winning?{x:winning.x,y:winning.y,w:winning.w,h:winning.h,code:winning.code,player:winning.player}:null,station:this.stationState,speech:this.session.speech,center:this.project(new pc.Vec3(0,8,0)),remaining:model?.shan?.paishu||0,
      profiles:this.session.opponents.map((character,i)=>({ ...character,...characterAppearance(character,i+1,model,this.session.rules,this.session.phase==='result'?this.session.result:null),player:i+1,riichi:!!model?.shoupai[model.player_id.indexOf(i+1)]?.lizhi })),
      ownWind:['東','南','西','北'][this.session.humanSeat],ownPoints:model?.defen[0]??25000,
      round:model?`${['東','南','西','北'][model.zhuangfeng]||'東'}${'一二三四'[model.jushu]}局`:'',honba:model?.changbang||0,deposits:model?.lizhibang||0});
  }
  project(point,camera=this.camera){const p=camera.camera.worldToScreen(point,new pc.Vec3(),BOARD_WIDTH,BOARD_HEIGHT);return {x:p.x,y:p.y};}
  corners(tile){const result=[],m=tile.entity.getWorldTransform();for(const x of [-TILE.width/2,TILE.width/2])for(const y of [-TILE.height/2,TILE.height/2])for(const z of [-TILE.depth/2,TILE.depth/2])result.push(this.project(m.transformPoint(new pc.Vec3(x,y,z)),tile.screenSpace?this.handCamera:this.camera));return result;}
  updateBounds(){for(const tile of this.tiles){const corners=this.corners(tile);tile.corners=corners;tile.x=Math.min(...corners.map(p=>p.x));tile.y=Math.min(...corners.map(p=>p.y));tile.w=Math.max(...corners.map(p=>p.x))-tile.x;tile.h=Math.max(...corners.map(p=>p.y))-tile.y;}}
  hit(x,y,padding){
    const near=this.handCamera.camera.screenToWorld(x,y,1,new pc.Vec3(),BOARD_WIDTH,BOARD_HEIGHT),far=this.handCamera.camera.screenToWorld(x,y,2000,new pc.Vec3(),BOARD_WIDTH,BOARD_HEIGHT);
    const dir=far.sub(near).normalize();let best=null,min=Infinity;
    const hand=this.tiles.filter(tile=>tile.kind==='hand'&&tile.player===0);
    for(const tile of hand){
      const inverse=new pc.Mat4().invert(tile.entity.getWorldTransform()),origin=inverse.transformPoint(near),direction=inverse.transformVector(dir).normalize(),point=new pc.Vec3();
      const box=new pc.BoundingBox(new pc.Vec3(),new pc.Vec3(TILE.width/2,TILE.height/2,TILE.depth/2));
      if(!box.intersectsRay(new pc.Ray(origin,direction),point))continue;
      const world=tile.entity.getWorldTransform().transformPoint(point);const distance=world.distance(near);
      if(distance<min){min=distance;best=tile;}
    }
    // A non-discardable tile must still block selection of its neighbours.
    if(best)return best.id?best:null;
    if(!padding)return null;
    // Only touch/pen input gets a small screen-space margin. Limit the margin
    // horizontally so even narrow portrait hands retain distinct targets.
    let score=Infinity;
    for(const tile of hand){
      const dx=Math.max(tile.x-x,0,x-tile.x-tile.w),dy=Math.max(tile.y-y,0,y-tile.y-tile.h);
      if(dx>Math.min(padding.x,tile.w/4)||dy>padding.y)continue;
      const distance=Math.hypot(dx,dy)+Math.abs(x-(tile.x+tile.w/2))/tile.w*.001;
      if(distance<score){score=distance;best=tile;}
    }
    return best?.id?best:null;
  }
  highlight(){for(const tile of this.hits){tile.meshInstances[0].material=tile.screenSpace?(tile.id===this.hover?this.handSelected:this.handIvory):(tile.id===this.hover?this.selected:this.white);if(tile.screenSpace&&tile.meshInstances[2])tile.meshInstances[2].material=(tile.id===this.hover?this.selectedFaceMaterials:this.flatFaceMaterials).get(tile.code);}this.app.renderNextFrame=true;}
  move(x,y){const id=this.hit(x,y)?.id||null;if(id!==this.hover){this.hover=id;this.highlight();}}
  activate(id){const hit=this.hits.find(h=>h.id===id);if(hit)this.session.discard(hit.tile,hit.drawn);}
  keyboard(key){const n=this.hits.length;if(!n)return;if(key==='ArrowLeft'||key==='ArrowRight'){this.keyboardIndex=(this.keyboardIndex+(key==='ArrowLeft'?-1:1)+n)%n;this.hover=this.hits[this.keyboardIndex].id;this.highlight();}else if(key==='Enter'||key===' ')this.activate(this.hover||this.hits[0].id);}
  resize(){this.dirty=true;if(this.ready)this.draw();}
  dispose(){if(this.disposed)return;this.disposed=true;this.clearTiles();this.handCamera.destroy();this.handLight.destroy();this.handFillLight.destroy();this.app.scene.layers.remove(this.handLayer);this.marker?.destroy();this.stationDisplay?.destroy();this.stationBody?.destroy();for(const m of this.materials)m.destroy();for(const t of this.textures)t.destroy();for(const m of this.meshes){m.decRefCount();m.destroy();}this.meshes=[];this.materials=[];this.textures=[];this.faceMaterials.clear();this.flatFaceMaterials.clear();this.selectedFaceMaterials.clear();this.stationCanvas=null;this.stationState=null;this.onView=()=>{};}
}
