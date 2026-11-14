import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
export function filesIn(directory) {
 return readdirSync(directory).filter(name=>!name.startsWith('.')).sort().flatMap(name=>{
  const path=join(directory,name);return statSync(path).isDirectory()?filesIn(path):[path];
 });
}
export function pwaBuild() {
 const root=process.cwd(),hash=createHash('sha256');
 const inputs=['src','public','index.html','package.json','package-lock.json','vite.config.js','scripts/pwa-sw.js','scripts/pwa-build.mjs'];
 for(const input of inputs){const path=resolve(root,input);for(const file of statSync(path).isDirectory()?filesIn(path):[path])hash.update(relative(root,file)).update(readFileSync(file));}
 const buildId=hash.digest('hex').slice(0,16);let out;
 return {name:'mahjong-pwa',apply:'build',
  config(){return {define:{__PWA_BUILD_ID__:JSON.stringify(buildId)}};},
  configResolved(config){out=resolve(config.root,config.build.outDir);},
  closeBundle(){
   const files=filesIn(out).filter(path=>!['sw.js','pwa-assets.json'].includes(relative(out,path))).map(path=>relative(out,path).split('\\').join('/'));
   const template=readFileSync(resolve(root,'scripts/pwa-sw.js'),'utf8');
   writeFileSync(join(out,'sw.js'),template.replace('__PWA_BUILD_ID__',JSON.stringify(buildId)).replace('__PWA_ASSETS__',JSON.stringify(files)));
   writeFileSync(join(out,'pwa-assets.json'),JSON.stringify({buildId,files,bytes:files.reduce((sum,path)=>sum+statSync(join(out,path)).size,0)},null,2)+'\n');
  }
 };
}
