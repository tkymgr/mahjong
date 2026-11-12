#!/usr/bin/env python3
"""Convert the pinned CC0 FBX tile to small, centered PlayCanvas mesh data.

The upstream 24-vertex beveled mesh and per-corner normals are retained;
triangles crossing the resin laminate seam are clipped into two materials.
No third-party game logic, textures, or unrelated models are imported.
"""
from pathlib import Path
import struct, zlib, math, json, hashlib
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'assets/models/candidates/just-mahjong/tileFbx.fbx'
data = source.read_bytes()

def prop(offset):
    kind = chr(data[offset]); offset += 1
    scalars = {'Y':'h','C':'?','I':'i','F':'f','D':'d','L':'q'}
    if kind in scalars:
        fmt = '<'+scalars[kind]
        return struct.unpack_from(fmt,data,offset)[0], offset+struct.calcsize(fmt)
    if kind in 'fdlib':
        count,encoding,size = struct.unpack_from('<III',data,offset); offset += 12
        raw = data[offset:offset+size]
        if encoding: raw=zlib.decompress(raw)
        fmt={'f':'f','d':'d','l':'q','i':'i','b':'?'}[kind]
        return list(struct.unpack('<'+str(count)+fmt,raw)),offset+size
    if kind in 'SR':
        size=struct.unpack_from('<I',data,offset)[0]; offset+=4
        raw=data[offset:offset+size]
        return (raw.decode('utf8','replace') if kind=='S' else raw),offset+size
    raise ValueError(kind)

def node(offset):
    end,count,_,length=struct.unpack_from('<IIIB',data,offset)
    if not end: return None,offset+13
    name=data[offset+13:offset+13+length].decode(); offset+=13+length
    values=[]
    for _ in range(count): value,offset=prop(offset); values.append(value)
    children=[]
    while offset<end-13:
        child,offset=node(offset)
        if child: children.append(child)
    return {'name':name,'values':values,'children':children},end
nodes=[];offset=27
assert data.startswith(b'Kaydara FBX Binary')
assert struct.unpack_from('<I',data,23)[0] < 7500
while offset<len(data)-13:
    item,offset=node(offset)
    if not item: break
    nodes.append(item)
def find(items,name):
    for item in items:
        if item['name']==name: return item
        found=find(item['children'],name)
        if found:return found
geometry=find(nodes,'Geometry')
vertices=find(geometry['children'],'Vertices')['values'][0]
indices=find(geometry['children'],'PolygonVertexIndex')['values'][0]
normals=find(geometry['children'],'Normals')['values'][0]
assert len(normals)==len(indices)*3
bounds=[(min(vertices[i::3]),max(vertices[i::3])) for i in range(3)]
spec=json.loads((ROOT/'assets/models/tile-spec.json').read_text())
dimensions=[spec['dimensions'][key] for key in ['width','height','depth']]
factors=[dimensions[i]/(hi-lo) for i,(lo,hi) in enumerate(bounds)]
def normalize(values):
    length=math.sqrt(sum(v*v for v in values))
    return [v/length for v in values]
def vertex(index,corner):
    position=[(vertices[index*3+i]-(bounds[i][0]+bounds[i][1])/2)*factors[i] for i in range(3)]
    normal=normalize([normals[corner*3+i]/factors[i] for i in range(3)])
    return position+normal
cut=-dimensions[2]/2+dimensions[2]*.35

def clip(polygon,white):
    result=[]
    inside=lambda v: v[2]>=cut-1e-8 if white else v[2]<=cut+1e-8
    for i,current in enumerate(polygon):
        previous=polygon[i-1];a,b=inside(previous),inside(current)
        if a!=b:
            t=(cut-previous[2])/(current[2]-previous[2])
            result.append([previous[j]+t*(current[j]-previous[j]) for j in range(6)])
        if b:result.append(current)
    return result
meshes={key:{'positions':[],'normals':[],'indices':[]} for key in ['ivory','back']}
polygon=[]
for corner,encoded in enumerate(indices):
    polygon.append(vertex(encoded if encoded>=0 else ~encoded,corner))
    if encoded>=0:continue
    for material in meshes:
        clipped=clip(polygon,material=='ivory')
        for i in range(1,len(clipped)-1):
            triangle=[clipped[0],clipped[i],clipped[i+1]]
            a,b,c=[v[:3] for v in triangle]
            u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
            cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            if sum(x*x for x in cross)<1e-12:continue
            if sum(cross[j]*triangle[0][j+3] for j in range(3))<0:triangle.reverse()
            mesh=meshes[material]
            for vert in triangle:
                mesh['indices'].append(len(mesh['positions'])//3)
                mesh['positions'].extend(round(x,6) for x in vert[:3])
                mesh['normals'].extend(round(x,6) for x in normalize(vert[3:]))
    polygon=[]
assert not polygon
result={'schema':'mahjong-playcanvas-mesh-v1','dimensions':spec['dimensions'],'origin':'tile center; local front +Z; upright +Y','laminate':{'ivory':.65,'back':.35},'source':{'repository':'https://github.com/hiinaspace/just-mahjong','commit':'9ade9ec79d28b5d28f74448a17d0b37dafd63f42','path':'Assets/Riichi/tileFbx.fbx','license':'CC0 as stated in upstream README','sha256':hashlib.sha256(data).hexdigest()},'meshes':meshes}
target=ROOT/'public/models/mahjong-tile.json'
target.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'{target}: '+str(sum(len(m["indices"])//3 for m in meshes.values()))+' triangles')
