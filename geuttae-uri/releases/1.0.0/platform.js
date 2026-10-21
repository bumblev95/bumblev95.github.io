// Explicit exports only: photos and questions stay in memory until the user saves.
export function inviteURL(code){
 if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))throw new Error('Invalid room code');
 return 'https://bumblev95.github.io/geuttae-uri/?room='+code;
}
export async function saveFile(blob,filename){
 if(window.__NATIVE__)return window.__NATIVE__.saveFile(blob,filename);
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
