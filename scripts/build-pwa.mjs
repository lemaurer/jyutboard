import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())result.push(...await files(path));else result.push(path);}return result;}
const paths=(await files('dist')).filter(path=>!path.endsWith('sw.js')).sort();
const hash=createHash('sha256');for(const path of paths)hash.update(await readFile(path));
const version=`jyutboard-${hash.digest('hex').slice(0,16)}`;
const urls=paths.map(path=>'./'+path.slice(5));
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(version)};const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jyutboard-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
const asset=event.request.mode==='navigate'?'./index.html':url.pathname;
event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(asset))||fetch(event.request)));});
`);
