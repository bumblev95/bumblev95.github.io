// All processing is local. No photos or book contents leave this device.
export function bookSheets(book){
 const sheets=[...book.children].filter(el=>el.matches('.book-cover,.memory-page,.book-ending,.book-appendix'));
 return sheets.flatMap(el=>{
  if(!el.matches('.book-appendix'))return [el];
  return [...el.querySelectorAll('.quiz-record')].map(record=>{const page=el.cloneNode(false);page.append(el.querySelector('header').cloneNode(true),record.cloneNode(true));return page;});
 });
}
export function mountBook(root){
 const book=root.querySelector('.memory-book'),pages=bookSheets(book);
 const disclosure=book.querySelector('.sample');if(disclosure)root.prepend(disclosure);book.replaceChildren(...pages);root.classList.add('paged-reader');
 const controls=document.createElement('div');controls.className='book-controls';
 controls.innerHTML='<button type="button" aria-label="이전 페이지">←</button><span aria-live="polite"></span><button type="button" aria-label="다음 페이지">→</button>';
 root.append(controls);const [prev,next]=controls.querySelectorAll('button'),label=controls.querySelector('span');
 let current=0,start=null;const wide=matchMedia('(min-width:800px)');
 const step=()=>wide.matches&&current>0?2:1;
 function draw(){pages.forEach((el,i)=>{el.hidden=!(i>=current&&i<current+step());});label.textContent=`${current+1}${step()===2&&current+1<pages.length?'–'+Math.min(current+2,pages.length):''} / ${pages.length}`;prev.disabled=current===0;next.disabled=current+step()>=pages.length;book.classList.toggle('spread',step()===2);}
 function turn(direction){current=direction>0?Math.min(pages.length-1,current+step()):Math.max(0,current-(wide.matches&&current>1?2:1));draw();book.classList.remove('page-turn');void book.offsetWidth;book.classList.add('page-turn');}
 prev.onclick=()=>turn(-1);next.onclick=()=>turn(1);
 root.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();turn(e.key==='ArrowRight'?1:-1);}};
 root.addEventListener('touchstart',e=>{start={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};},{passive:true});
 root.addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);start=null;},{passive:true});
 // ResizeObserver is automatically disconnected when this reader is replaced.
 const observer=new ResizeObserver(()=>{if(!root.isConnected){observer.disconnect();return;}draw();});observer.observe(root);draw();
}
function jpegPDF(images){
 const enc=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const put=value=>{const b=typeof value==='string'?enc.encode(value):value;chunks.push(b);length+=b.length;};
 const object=(id,body)=>{offsets[id]=length;put(`${id} 0 obj\n`);put(body);put('\nendobj\n');};
 put('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 images.forEach((image,i)=>{const id=3+i*3;object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Photo ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
 offsets[id+1]=length;put(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);put(image.bytes);put('\nendstream\nendobj\n');
 const scale=Math.min(555.28/image.width,801.89/image.height),w=image.width*scale,h=image.height*scale,body=`q ${w} 0 0 ${h} ${(595.28-w)/2} ${(841.89-h)/2} cm /Photo Do Q`;
 object(id+2,`<< /Length ${enc.encode(body).length} >>\nstream\n${body}\nendstream`);
 });const xref=length;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);offsets.slice(1).forEach(n=>put(`${String(n).padStart(10,'0')} 00000 n \n`));put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}
let renderer;
async function loadRenderer(){
 if(!renderer)renderer=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/html2canvas.js',import.meta.url).href;script.onload=()=>resolve(window.html2canvas);script.onerror=()=>{renderer=null;script.remove();reject(new Error('PDF renderer unavailable'));};document.head.append(script);});return renderer;
}
export async function downloadBookPDF(html,progress=()=>{}){
 const render=await loadRenderer(),frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';document.body.append(frame);
 try{
 const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();await doc.fonts.ready;
 await Promise.all([...doc.images].map(img=>img.decode().catch(()=>{})));
 const book=doc.querySelector('.memory-book'),pages=bookSheets(book),disclosure=book.querySelector('.sample');if(disclosure){const note=doc.createElement('p');note.textContent=disclosure.textContent;note.style.cssText='font-size:11px;color:#626b5e';pages[0].append(note);}book.replaceChildren(...pages);
 const style=doc.createElement('style');style.textContent='.memory-book{width:794px;max-width:none;padding:24px;box-sizing:border-box}.memory-book>.sample,.print-note{display:none!important}.memory-book>.book-cover,.memory-book>.memory-page,.memory-book>.book-appendix,.memory-book>.book-ending{margin:0!important;min-height:1000px;box-sizing:border-box;border-radius:0!important}.memory-book .journal-content{display:block!important}.memory-book .photo-mount .memory-image{height:400px!important}.memory-book .journal-note{max-width:none!important}';doc.head.append(style);
 const images=[];
 for(let i=0;i<pages.length;i++){progress(`PDF 만드는 중 · ${i+1}/${pages.length}`);pages.forEach((p,j)=>p.style.display=j===i?'block':'none');const canvas=await render(pages[i],{scale:1.5,backgroundColor:'#fffdf7',logging:false});const bytes=Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]),c=>c.charCodeAt(0));images.push({bytes,width:canvas.width,height:canvas.height});canvas.width=canvas.height=1;}
 const url=URL.createObjectURL(jpegPDF(images)),link=document.createElement('a');link.href=url;link.download='Then-Us-Memory-Book.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }finally{frame.remove();}
}
