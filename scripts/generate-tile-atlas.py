#!/usr/bin/env python3
"""Assemble a coordinate-compatible mahjong atlas from supplied faces and materials.

Tile faces are extracted exactly from the user-provided sheet. Tile bodies are
independently generated materials. Dealer lettering uses an OFL font. Coordinates are
an interface to the existing renderer, not a tracing of the previous artwork.
"""
from pathlib import Path
import argparse
import json
import hashlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageOps, ImageColor, ImageEnhance, ImageCms
from functools import lru_cache
import math
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
S = 3  # Supersampling for clean edges at the original game's pixel size.
IVORY = '#fff9e9'
EDGE = '#d9d3bd'
INK = '#142128'
JADE = '#14522b'
LIGHT = '#408574'
DARK = '#13483e'
RED = '#a0180e'
GOLD = '#bb8c4d'

# AMOS SMART reference proportions: 28 x 21 x 16.5 mm. The existing
# orthographic view projects the face to 48x44 / 64x33 and the side
# thickness below it. Those face heights must fit the 44px / 33px river pitch.
FACE_HEIGHT = {(48,72):44, (64,60):33}
BACK_DEPTH_FRACTION = .35  # Same laminate depth as the accepted upright side poses.


def canvas(w, h):
    return Image.new('RGBA', (round(w*S), round(h*S)))


def box(draw, rect, fill, outline=None, radius=0, width=1):
    rect = tuple(round(x*S) for x in rect)
    if radius:
        draw.rounded_rectangle(rect, radius=round(radius*S), fill=fill, outline=outline, width=max(1,round(width*S)))
    else:
        draw.rectangle(rect, fill=fill, outline=outline, width=max(1,round(width*S)))


def line(draw, points, fill, width=1.6):
    points = [(round(x*S),round(y*S)) for x,y in points]
    thick = max(1,round(width*S))
    draw.line(points, fill=fill, width=thick, joint='curve')
    r = thick/2
    for x,y in (points[0],points[-1]):
        draw.ellipse((round(x-r),round(y-r),round(x+r),round(y+r)),fill=fill)


def dot(draw, x, y, r, color):
    draw.ellipse(tuple(round(v*S) for v in (x-r,y-r,x+r,y+r)),fill=color)


@lru_cache(maxsize=2)
def tile_font():
    return ImageFont.truetype(str(ROOT/'assets/tiles/MahjongTileSerif.otf'), 96*S)


def vertical_gradient(size, top, bottom):
    image=Image.new('RGBA',size)
    d=ImageDraw.Draw(image)
    for y in range(size[1]):
        t=y/max(1,size[1]-1)
        color=tuple(round(a+(b-a)*t) for a,b in zip(top,bottom))
        d.line((0,y,size[0],y),fill=color)
    return image


def engrave(image, mask, color):
    # The lower lip catches light; the opposite lip is a shallow recess shadow.
    lip=ImageChops.subtract(ImageChops.offset(mask,1,2),mask)
    highlight=Image.new('RGBA',image.size,(255,255,246,0))
    highlight.putalpha(lip.point(lambda x:round(x*.68)))
    image.alpha_composite(highlight)
    lip=ImageChops.subtract(ImageChops.offset(mask,-1,-1),mask)
    shadow=Image.new('RGBA',image.size,(83,65,44,0))
    shadow.putalpha(lip.point(lambda x:round(x*.35)))
    image.alpha_composite(shadow)
    color=ImageColor.getrgb(color)
    paint=vertical_gradient(image.size,tuple(round(v*.64) for v in color),tuple(min(255,round(v*1.18+3)) for v in color))
    paint.putalpha(mask)
    image.alpha_composite(paint)


def glyph(image, char, rect, color=INK, width=1.65):
    x,y,w,h=rect
    font=tile_font()
    bounds=font.getbbox('東')
    # Keep a shared em box: stretching each character's tight bounding box
    # would turn the single horizontal stroke of 一 into an oversized wedge.
    letter=Image.new('L',(font.size,bounds[3]-bounds[1]))
    ImageDraw.Draw(letter).text((-bounds[0],-bounds[1]),char,font=font,fill=255)
    letter=letter.resize((round(w*S),round(h*S)),Image.Resampling.LANCZOS)
    mask=Image.new('L',image.size)
    mask.paste(letter,(round(x*S),round(y*S)))
    engrave(image,mask,color)


def unmatte_white(image):
    # Preserve supplied glyph colors/antialiasing while removing the white
    # matte. Rebuilding a tile from an AI approximation would change the art.
    output=Image.new('RGBA',image.size)
    pixels=[]
    for r,g,b,a in image.convert('RGBA').get_flattened_data():
        minimum=min(r,g,b)
        opacity=255-minimum
        if not opacity:
            pixels.append((0,0,0,0))
        else:
            pixels.append(tuple(round((c-minimum)*255/opacity) for c in (r,g,b))+(round(a*opacity/255),))
    output.putdata(pixels)
    return output


def load_user_faces():
    source=Image.open(ROOT/'assets/tiles/user-tile-sheet.png')
    source_profile='none'
    if source.info.get('icc_profile'):
        profile=ImageCms.ImageCmsProfile(BytesIO(source.info['icc_profile']))
        source_profile=ImageCms.getProfileName(profile).strip()
        source=ImageCms.profileToProfile(source,profile,ImageCms.createProfile('sRGB'),outputMode='RGBA')
    else:
        source=source.convert('RGBA')
    if source.size!=(638,592):
        raise ValueError('The supplied tile sheet must be 638x592; update crop coordinates for another layout.')
    # Runtime order is man / pin / sou / E S W N white green red.
    # Supplied honor row instead puts green before white.
    cells=[(f'{suit}-{n}',row,n-1) for suit,row in [('man',2),('pin',0),('sou',1)] for n in range(1,10)]
    cells += [(name,3,col) for name,col in [('east',0),('south',1),('west',2),('north',3),('white',5),('green',4),('red',6)]]
    extras=[('red-pin-5',4,0),('red-sou-5',4,1),('red-man-5',4,2)]
    directory=ROOT/'assets/tiles/user-faces';directory.mkdir(parents=True,exist_ok=True)
    faces=[];records=[]
    for index,(name,row,col) in enumerate(cells+extras):
        left,top=11+col*66,20+row*118
        # Exclude the supplied tile frame and shadow, retaining a consistent
        # face box so no single glyph is independently stretched or recentered.
        rect=(left+5,top+5,left+61,top+81)
        content=unmatte_white(source.crop(rect))
        if name=='white':
            assert content.getbbox() is None, 'White dragon must map to the blank source tile.'
        else:
            assert content.getbbox() is not None, f'Missing source art: {name}'
        content.save(directory/f'{name}.png')
        image=canvas(42,58)
        fitted=ImageOps.contain(content,image.size,Image.Resampling.LANCZOS)
        image.alpha_composite(fitted,((image.width-fitted.width)//2,(image.height-fitted.height)//2))
        if index<34:faces.append(image)
        records.append({'name':name,'sourceRow':row,'sourceColumn':col,'crop':list(rect),'runtimeIndex':index if index<34 else None,'file':f'assets/tiles/user-faces/{name}.png'})
    (ROOT/'assets/tiles/user-tile-sheet-layout.json').write_text(json.dumps({'source':'assets/tiles/user-tile-sheet.png','sourceSize':[638,592],'sourceProvenance':'user-provided attachment','sourceSha256':hashlib.sha256((ROOT/'assets/tiles/user-tile-sheet.png').read_bytes()).hexdigest(),'sourceColorProfile':source_profile,'colorHandling':'Convert embedded ICC profile to sRGB, then remove white matte while retaining colors and antialiasing.','sourceProvider':'麻雀豆腐','sourcePage':'https://majandofu.com/mahjong-images','permissionRecord':'assets/tiles/user-tile-sheet-source.json','license':'配布元の個別利用条件（個人・商用利用、加工可。著作権は配布元に留保）','cells':records,'redFives':'Red fives are rendered when enabled in the rule settings.'},ensure_ascii=False,indent=2)+'\n')
    return faces


@lru_cache(maxsize=2)
def tile_photo(standing):
    path=ROOT/'assets/tiles'/('tile-standing.png' if standing else 'tile-flat.png')
    image=Image.open(path).convert('RGBA')
    bounds=image.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
    return image.crop(bounds)


def resin_layer(source,width,height,base):
    im=Image.new('RGBA',(width*S,height*S),base)
    im.alpha_composite(source.resize(im.size,Image.Resampling.LANCZOS))
    return im


def amber_resin(width,height,top=False):
    # One material reference for the held back, exposed discard edge and wall.
    photo=hand_pose_photo('opposite-standing-back.png')
    patch=photo.crop((0,round(photo.height*.40),photo.width,round(photo.height*.82)))
    im=resin_layer(patch,width,height,'#c1851b')
    if top:
        # The upward surface catches more light, while retaining the same hue.
        im=ImageEnhance.Brightness(im).enhance(1.10)
    return im


@lru_cache(maxsize=8)
def tile_body(w,h,standing,back):
    photo=tile_photo(standing)
    im=canvas(w,h)
    if standing:
        material=photo.resize(((w-1)*S,(h-1)*S),Image.Resampling.LANCZOS)
    else:
        split=round(photo.height*.905)
        face_height=FACE_HEIGHT[(w,h)]
        depth=h-1-face_height
        amber_depth=round(depth*BACK_DEPTH_FRACTION)
        white_depth=depth-amber_depth
        white_face=photo.crop((0,0,photo.width,split))
        side=photo.crop((0,round(photo.height*.74),photo.width,split))
        side_grey=ImageOps.grayscale(side)
        white_side=ImageOps.colorize(side_grey,'#827b6b','#d5d1c7').convert('RGBA')
        white_side.putalpha(side.getchannel('A'))
        material=canvas(w-1,h-1)
        if back:
            # Face-down wall: yellow plane, thin yellow side, then white core.
            material.alpha_composite(amber_resin(w-1,face_height,top=True),(0,0))
            material.alpha_composite(amber_resin(w-1,amber_depth),(0,face_height*S))
            material.alpha_composite(resin_layer(white_side,w-1,white_depth,'#c7c2b7'),(0,(face_height+amber_depth)*S))
        else:
            # Face-up discard: white plane, white core, then thin yellow back.
            material.alpha_composite(resin_layer(white_face,w-1,face_height,'#f0eadf'),(0,0))
            material.alpha_composite(resin_layer(white_side,w-1,white_depth,'#c7c2b7'),(0,face_height*S))
            material.alpha_composite(amber_resin(w-1,amber_depth),(0,(face_height+white_depth)*S))
        # Preserve the independently generated tile silhouette and rounded rim.
        silhouette=photo.resize(material.size,Image.Resampling.LANCZOS).getchannel('A')
        material.putalpha(silhouette)
    im.alpha_composite(material,(round(.5*S),0))
    return im


def tile(index, faces, orientation=0, standing=False, back=False):
    w,h=(64,60) if orientation in (90,270) else (48,72)
    im=tile_body(w,h,standing,back).copy()
    if index<34 and not back:
        top,bottom=(8,67) if standing else (3,FACE_HEIGHT[(w,h)]-2)
        symbol=faces[index].rotate(orientation,expand=True,resample=Image.Resampling.BICUBIC)
        symbol=symbol.resize((round((w-9)*S),round((bottom-top)*S)),Image.Resampling.LANCZOS)
        im.alpha_composite(symbol,(round(4.5*S),top*S))
    return im

@lru_cache(maxsize=2)
def hand_pose_photo(filename):
    photo=Image.open(ROOT/'assets/tiles'/filename).convert('RGBA')
    bounds=photo.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox()
    return photo.crop(bounds)


def fit_hand_planes(photo,width,source_cuts,heights):
    # Fit each photographed plane to the renderer's physical projection,
    # rather than stretching a face-down wall tile into an upright pose.
    im=canvas(width,sum(heights))
    cuts=[0]+[round(photo.height*t) for t in source_cuts]+[photo.height]
    dest_y=0
    for top,bottom,height in zip(cuts,cuts[1:],heights):
        plane=photo.crop((0,top,photo.width,bottom)).resize((width*S,height*S),Image.Resampling.LANCZOS)
        im.alpha_composite(plane,(0,dest_y*S))
        dest_y+=height
    return im


def opposite_standing_back():
    # White far top cap (17px), amber near lip (9px), upright amber back
    # (46px). A face-down wall tile instead has its white core at the bottom.
    photo=hand_pose_photo('opposite-standing-back.png')
    return fit_hand_planes(photo,48,[.184,.276],[17,9,46])


def side_standing(player):
    # Left player's front faces screen-left. Mirror for the right player so
    # its white front faces screen-right. Both backs point toward the table.
    photo=hand_pose_photo('side-standing-left.png')
    im=fit_hand_planes(photo,40,[.33],[33,45])
    return ImageOps.mirror(im) if player=='right' else im


@lru_cache(maxsize=2)
def marker_body(vertical):
    # A dealer marker is a solid, thin orange plate, separate from tile_body.
    filename='dealer-marker-vertical.png' if vertical else 'dealer-marker-horizontal.png'
    photo=Image.open(ROOT/'assets/tiles'/filename).convert('RGBA')
    bounds=photo.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox()
    photo=photo.crop(bounds)
    size=(43,69) if vertical else (92,36)
    cell=(50,70) if vertical else (100,40)
    im=canvas(*cell)
    im.alpha_composite(photo.resize(tuple(n*S for n in size),Image.Resampling.LANCZOS))
    return im


def dealer_marker(direction, char):
    im=marker_body(bool(direction%2)).copy()
    lettering=canvas(30,28)
    glyph(lettering,char,(1,1,28,26),'#14120e')
    lettering=lettering.rotate(direction*90,expand=True)
    if direction%2:
        lettering=lettering.resize((30*S,24*S),Image.Resampling.LANCZOS)
        position=(round(6.5*S),21*S)
    else:
        position=(31*S,2*S)
    im.alpha_composite(lettering,position)
    return im


def generate(output):
    faces=load_user_faces()
    atlas=canvas(1200,1200)
    regions=[]
    def paste(im,x,y,name):
        atlas.alpha_composite(im,(round(x*S),round(y*S)))
        regions.append({'name':name,'x':x,'y':y,'w':im.width//S,'h':im.height//S})
    for i in range(36):
        x,y=(i%6)*48,(i//6)*72
        paste(tile(i,faces,back=i==35),x,y,f'tile-{i}-front')
        paste(tile(i,faces,orientation=180,back=i==35),288+x,y,f'tile-{i}-opposite')
        if i<34:paste(tile(i,faces,standing=True),576+x,y,f'tile-{i}-standing')
        x,y=(i//6)*64,540+(i%6)*60
        paste(tile(i,faces,orientation=90,back=i==35),x,y,f'tile-{i}-right')
        paste(tile(i,faces,orientation=270,back=i==35),384+x,y,f'tile-{i}-left')
    # Red fives occupy previously unused atlas space; the MIT core distinguishes m0/p0/s0.
    for red_index,suit in enumerate(['man','pin','sou']):
        raw=Image.open(ROOT/f'assets/tiles/user-faces/red-{suit}-5.png').convert('RGBA')
        red_face=canvas(42,58)
        fitted=ImageOps.contain(raw,red_face.size,Image.Resampling.LANCZOS)
        red_face.alpha_composite(fitted,((red_face.width-fitted.width)//2,(red_face.height-fitted.height)//2))
        for direction in range(4):
            horizontal=direction%2
            x=900+red_index*(64 if horizontal else 48)
            y=(216 if direction==1 else 276) if horizontal else (0 if direction==0 else 72)
            paste(tile(0,[red_face],orientation=direction*90),x,y,f'red-{suit}-{direction}')
        paste(tile(0,[red_face],standing=True),900+red_index*48,144,f'red-{suit}-standing')
    paste(opposite_standing_back(),0,440,'opposite-standing-back')
    for x,player in [(100,'right'),(150,'left')]:
        paste(side_standing(player),x,440,f'side-standing-back-{x}')
    for direction,xy in enumerate([(400,440),(200,440),(400,480),(300,440)]):
        for phase,char in enumerate(['東','南']):
            im=dealer_marker(direction,char)
            x,y=xy
            paste(im,x+(50 if direction%2 else 100)*phase,y,f'dealer-{direction}-{phase}')
    positions=[[],[(.5,.5)],[(.25,.25),(.75,.75)],[(.25,.25),(.5,.5),(.75,.75)],[(.25,.25),(.75,.25),(.25,.75),(.75,.75)],[(.25,.25),(.75,.25),(.5,.5),(.25,.75),(.75,.75)],[(x,y) for x in (.25,.75) for y in (.23,.5,.77)]]
    # The original slots are 30x30, but the visible die is only 22x24.
    # Dice are placed 20px apart horizontally / 16px vertically: top faces
    # must fit that pitch, while only the 3D side/shadow may overlap.
    side_values=[2,3,1,5,4,2]
    for n in range(6):
        im=canvas(30,30)
        shadow=Image.new('L',im.size);sd=ImageDraw.Draw(shadow)
        box(sd,(2,2,21,23),65,radius=1.5)
        shade=Image.new('RGBA',im.size,(12,18,14,0));shade.putalpha(shadow)
        im.alpha_composite(shade)
        photo=Image.open(ROOT/'assets/tiles/dice-blank.png').convert('RGBA')
        bounds=photo.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox()
        body=photo.crop(bounds).resize((20*S,22*S),Image.Resampling.LANCZOS)
        im.alpha_composite(body,(0,0))
        def dimple(cx,cy,rx,ry,color):
            mask=Image.new('L',im.size)
            md=ImageDraw.Draw(mask)
            md.ellipse(tuple(round(v*S) for v in (cx-rx,cy-ry,cx+rx,cy+ry)),fill=255)
            engrave(im,mask,color)
        for x,y in positions[n+1]:
            dimple(2+x*16,1+y*11,1.75 if n==0 else 1.35,.95 if n==0 else .82,RED if n==0 else '#141716')
        for x,y in positions[side_values[n]]:
            dimple(2+x*16,14.5+y*6,.78,.48,'#202322')
        paste(im,200+n*30,510,f'die-{n+1}')
    im=canvas(120,20);d=ImageDraw.Draw(im)
    box(d,(1,5,118,15),IVORY,outline=EDGE,radius=4,width=1);dot(d,60,10,3.4,RED)
    paste(im,740,440,'riichi-stick-horizontal')
    paste(im.rotate(90,expand=True).resize((20*S,100*S),Image.Resampling.LANCZOS),720,440,'riichi-stick-vertical')
    for x,count in [(740,1),(770,3)]:
        im=canvas(30,30);d=ImageDraw.Draw(im)
        line(d,[(5,24),(23,6)],IVORY,5)
        for j in range(count):dot(d,11+j*4,18-j*4,.9,RED if count==1 else INK)
        paste(im,x,460,'riichi-counter' if count==1 else 'honba-counter')
    for x,w,h in [(0,60,43),(80,60,32),(160,76,32),(240,55,35)]:
        im=canvas(w,h);d=ImageDraw.Draw(im)
        mask=Image.new('L',im.size);md=ImageDraw.Draw(mask)
        box(md,(3,2,w-2,h-2),70,radius=5)
        mask=mask.filter(ImageFilter.GaussianBlur(2*S))
        im.paste((12,20,13),mask=mask)
        paste(im,x,960,f'shadow-{x}')
    rgba=atlas.resize((1200,1200),Image.Resampling.LANCZOS)
    # GIF has one-bit alpha: reserve the absent magenta color for transparency.
    rgb=Image.new('RGB',rgba.size,(255,0,255))
    rgb.paste(rgba.convert('RGB'),mask=rgba.getchannel('A').point(lambda a:255 if a>=128 else 0))
    gif=rgb.quantize(colors=255,method=Image.Quantize.MEDIANCUT)
    transparent=gif.getpixel((1199,1199))
    assert tuple(gif.getpalette()[transparent*3:transparent*3+3])==(255,0,255)
    output.parent.mkdir(parents=True,exist_ok=True)
    gif.save(output,format='GIF',transparency=transparent,optimize=False,disposal=2)
    (ROOT/'assets/tiles/atlas-layout.json').write_text(json.dumps({'size':[1200,1200],'regions':regions},ensure_ascii=False,indent=2)+'\n')
    # Editable/review PNG is independent of the runtime GIF and never loaded by the game.
    rgba.save(ROOT/'assets/tiles/pat-source.png')
    rgba.save(ROOT/'public/js/pat.png')
    print(f'{output}: 1200 x 1200, transparent GIF; {len(regions)} sprite regions')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'public/js/pat.gif')
    generate(parser.parse_args().output)
