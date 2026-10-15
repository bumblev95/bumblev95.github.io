import {build} from 'esbuild';
import {readFile,writeFile,cp,rm,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'mobile/www');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of ['assets','shell-v1.css'])await cp(path.join(root,file),path.join(out,file),{recursive:true});
// The PDF renderer is deliberately local and not downloaded at runtime.
await mkdir(path.join(out,'vendor'));await cp(path.join(root,'releases/0.5.0/vendor/html2canvas.js'),path.join(out,'vendor/html2canvas.js'));
let html=await readFile(path.join(root,'index.html'),'utf8');html=html.replace('<link rel="manifest" href="./manifest.webmanifest">','').replace('./boot-v2.js','./mobile.js').replace('</head>','<link rel="stylesheet" href="./app.css"><link rel="stylesheet" href="./native.css"></head>');
await writeFile(path.join(out,'index.html'),html);await cp(path.join(root,'releases/0.5.0/style.css'),path.join(out,'app.css'));
await writeFile(path.join(out,'native.css'),`body{padding-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));padding-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));padding-left:var(--safe-area-inset-left,0px);padding-right:var(--safe-area-inset-right,0px)}#toast{bottom:calc(26px + var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))}dialog{max-height:calc(100dvh - var(--safe-area-inset-top,0px) - var(--safe-area-inset-bottom,0px) - 32px)}@media(min-width:700px){.app-shell{margin:16px auto;min-height:calc(100dvh - 32px)}}`);
await build({entryPoints:[path.join(root,'mobile/src/main.js')],outfile:path.join(out,'mobile.js'),bundle:true,format:'esm',charset:'utf8',target:'chrome105',legalComments:'eof',sourcemap:false});
console.log('Bundled Android UI v0.5.0; local assets, no remote executable code.');
