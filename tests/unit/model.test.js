import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {TILE} from '../../src/game/model-layout.js';
const model=JSON.parse(fs.readFileSync('public/models/mahjong-tile.json','utf8'));
test('converted CC0 tile retains normalized dimensions, normals and a sharp laminate seam',()=>{
 assert.deepEqual(model.dimensions,{width:TILE.width,height:TILE.height,depth:TILE.depth});
 const positions=[];
 for(const [name,mesh] of Object.entries(model.meshes)){
  assert.equal(mesh.positions.length,mesh.normals.length);assert.equal(mesh.indices.length%3,0);
  for(let i=0;i<mesh.positions.length;i+=3){const n=mesh.normals.slice(i,i+3);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-5);positions.push(mesh.positions.slice(i,i+3));const z=mesh.positions[i+2],cut=-TILE.depth/2+TILE.depth*.35;assert.ok(name==='ivory'?z>=cut-1e-5:z<=cut+1e-5);}
  for(const index of mesh.indices)assert.ok(index>=0&&index<mesh.positions.length/3);
 }
 for(let axis=0;axis<3;axis++){const values=positions.map(p=>p[axis]),size=[TILE.width,TILE.height,TILE.depth][axis];assert.ok(Math.abs(Math.min(...values)+size/2)<1e-5);assert.ok(Math.abs(Math.max(...values)-size/2)<1e-5);}
 const hash=crypto.createHash('sha256').update(fs.readFileSync('assets/models/candidates/just-mahjong/tileFbx.fbx')).digest('hex');assert.equal(hash,model.source.sha256);
});
