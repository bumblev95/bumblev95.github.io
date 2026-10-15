import { t, tr } from "./locale.js";
import { saveFile } from './platform.js';
// All processing is local. No photos or book contents leave this device.
export function bookSheets(book) {
  const sheets = [...book.children].filter(el => el.matches('.book-cover,.book-index,.book-overview,.memory-page,.book-ending,.book-appendix'));
  return sheets.flatMap(el => {
    if (!el.matches('.book-appendix')) return [el];
    return [...el.querySelectorAll('.quiz-record')].map(record => {
      const page = el.cloneNode(false);
      page.append(el.querySelector('header').cloneNode(true), record.cloneNode(true));
      return page;
    });
  });
}
export function mountBook(root) {
  root._bookObserver?.disconnect();
  const book = root.querySelector('.memory-book'),
    pages = bookSheets(book);
  const disclosure = book.querySelector('.sample');
  if (disclosure) root.prepend(disclosure);
  book.replaceChildren(...pages);
  root.classList.add('paged-reader');
  const controls = document.createElement('div');
  controls.className = 'book-controls';
  controls.innerHTML = t("<button type=\"button\" aria-label=\"이전 페이지\">←</button><span aria-live=\"polite\"></span><button type=\"button\" aria-label=\"다음 페이지\">→</button>");
  root.append(controls);
  const [prev, next] = controls.querySelectorAll('button'),
    label = controls.querySelector('span');
  let current = Math.min(pages.length - 1, Math.max(0, Number(root.dataset.bookPage) || 0)),
    start = null;
  const wide = matchMedia('(min-width:800px)');
  const step = () => wide.matches && current > 0 ? 2 : 1;
  function draw() {
    root.dataset.bookPage = String(current);
    pages.forEach((el, i) => {
      el.hidden = !(i >= current && i < current + step());
    });
    label.textContent = `${current + 1}${step() === 2 && current + 1 < pages.length ? '–' + Math.min(current + 2, pages.length) : ''} / ${pages.length}`;
    prev.disabled = current === 0;
    next.disabled = current + step() >= pages.length;
    book.classList.toggle('spread', step() === 2);
  }
  function turn(direction) {
    current = direction > 0 ? Math.min(pages.length - 1, current + step()) : Math.max(0, current - (wide.matches && current > 1 ? 2 : 1));
    draw();
    book.classList.remove('page-turn');
    void book.offsetWidth;
    book.classList.add('page-turn');
  }
  prev.onclick = () => turn(-1);
  next.onclick = () => turn(1);
  root.onkeydown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      turn(e.key === 'ArrowRight' ? 1 : -1);
    }
  };
  root.ontouchstart = e => {
    start = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };
  };
  root.ontouchend = e => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x,
      dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
    start = null;
  };
  const picker = document.createElement('details');
  picker.className = 'book-page-picker';
  const summary = document.createElement('summary');
  summary.textContent = tr`전체 ${pages.length}페이지 보기`;
  picker.append(summary);
  const grid = document.createElement('div');
  grid.className = 'book-page-grid';
  pages.forEach((page, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${i + 1}. ${page.dataset.pageTitle || (page.matches('.book-cover') ? t("표지") : page.matches('.book-ending') ? t("마무리") : page.matches('.book-appendix') ? t("게임 기록") : t("추억"))}`;
    button.onclick = () => {
      current = i;
      draw();
      picker.open = false;
    };
    grid.append(button);
  });
  picker.append(grid);
  root.append(picker);
  root.onclick = e => {
    const target = e.target.closest('[data-book-target]');
    if (!target) return;
    const wanted = target.dataset.bookTarget;
    const index = pages.findIndex(page => page.id === wanted || [...page.querySelectorAll('[id]')].some(el => el.id === wanted));
    if (index >= 0) {
      e.preventDefault();
      current = index;
      draw();
    }
  };
  // ResizeObserver is automatically disconnected when this reader is replaced.
  const observer = new ResizeObserver(() => {
    if (!root.isConnected) {
      observer.disconnect();
      return;
    }
    draw();
  });
  root._bookObserver = observer;
  observer.observe(root);
  draw();
}
function jpegPDF(images) {
  const enc = new TextEncoder(),
    chunks = [],
    offsets = [0];
  let length = 0;
  const put = value => {
    const b = typeof value === 'string' ? enc.encode(value) : value;
    chunks.push(b);
    length += b.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    put(`${id} 0 obj\n`);
    put(body);
    put('\nendobj\n');
  };
  const annotations = [];
  let nextId = 3 + images.length * 3;
  const annotationIds = images.map(image => (image.links || []).map(link => {
    const id = nextId++;
    annotations.push({
      id,
      link,
      image
    });
    return id;
  }));
  const outlineRoot = nextId++,
    outlineIds = images.map(() => nextId++);
  const pdfText = text => '<FEFF' + Array.from(String(text)).map(c => {
    const value = c.codePointAt(0);
    return value <= 65535 ? value.toString(16).padStart(4, '0') : ((value - 65536 >> 10) + 55296).toString(16) + ((value - 65536 & 1023) + 56320).toString(16);
  }).join('') + '>';
  put('%PDF-1.4\n');
  object(1, `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>`);
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  images.forEach((image, i) => {
    const id = 3 + i * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Photo ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R ${annotationIds[i].length ? '/Annots [' + annotationIds[i].map(n => n + ' 0 R').join(' ') + ']' : ''} >>`);
    offsets[id + 1] = length;
    put(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    put(image.bytes);
    put('\nendstream\nendobj\n');
    const scale = Math.min(555.28 / image.width, 801.89 / image.height),
      w = image.width * scale,
      h = image.height * scale,
      body = `q ${w} 0 0 ${h} ${(595.28 - w) / 2} ${(841.89 - h) / 2} cm /Photo Do Q`;
    object(id + 2, `<< /Length ${enc.encode(body).length} >>\nstream\n${body}\nendstream`);
  });
  annotations.forEach(({
    id,
    link,
    image
  }) => {
    const scale = Math.min(555.28 / image.width, 801.89 / image.height),
      w = image.width * scale,
      h = image.height * scale,
      left = (595.28 - w) / 2,
      top = (841.89 - h) / 2 + h;
    const rect = [left + link.x * scale, top - (link.y + link.height) * scale, left + (link.x + link.width) * scale, top - link.y * scale].map(n => n.toFixed(2)).join(' ');
    object(id, `<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] /Dest [${3 + link.page * 3} 0 R /Fit] >>`);
  });
  object(outlineRoot, `<< /Type /Outlines /First ${outlineIds[0]} 0 R /Last ${outlineIds.at(-1)} 0 R /Count ${images.length} >>`);
  images.forEach((image, i) => object(outlineIds[i], `<< /Title ${pdfText(`${i + 1}. ${image.title || t("추억")}`)} /Parent ${outlineRoot} 0 R ${i ? `/Prev ${outlineIds[i - 1]} 0 R` : ''} ${i + 1 < images.length ? `/Next ${outlineIds[i + 1]} 0 R` : ''} /Dest [${3 + i * 3} 0 R /Fit] >>`));
  const xref = length;
  put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(n => put(`${String(n).padStart(10, '0')} 00000 n \n`));
  put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, {
    type: 'application/pdf'
  });
}
let renderer;
async function loadRenderer() {
  if (!renderer) renderer = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/html2canvas.js', import.meta.url).href;
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => {
      renderer = null;
      script.remove();
      reject(new Error('PDF renderer unavailable'));
    };
    document.head.append(script);
  });
  return renderer;
}
export async function downloadBookPDF(html, progress = () => {}, options = {}) {
  const checkAbort = () => {
    if (options.signal?.aborted) throw new DOMException('PDF export cancelled', 'AbortError');
  };
  checkAbort();
  const render = await loadRenderer(),
    frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
  document.body.append(frame);
  try {
    checkAbort();
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    await doc.fonts.ready;
    await Promise.all([...doc.images].map(img => img.decode().catch(() => {})));
    const book = doc.querySelector('.memory-book'),
      pages = bookSheets(book),
      disclosure = book.querySelector('.sample');
    if (disclosure) {
      const note = doc.createElement('p');
      note.textContent = disclosure.textContent;
      note.style.cssText = 'font-size:11px;color:#626b5e';
      pages[0].append(note);
    }
    book.replaceChildren(...pages);
    const style = doc.createElement('style');
    style.textContent = '.memory-book{width:794px;max-width:none;padding:24px;box-sizing:border-box}.memory-book>.sample,.print-note{display:none!important}.memory-book>.book-index,.memory-book>.book-overview,.memory-book>.book-cover,.memory-book>.memory-page,.memory-book>.book-appendix,.memory-book>.book-ending{margin:0!important;min-height:1000px;box-sizing:border-box;border-radius:0!important}.memory-book .journal-content{display:block!important}.memory-book .photo-mount .memory-image{height:auto!important;max-height:460px!important}.memory-book .journal-note{max-width:none!important}.memory-book[data-layout][data-cover] .multi-memory .photo-mount .memory-image{height:230px!important;max-height:230px!important}';
    doc.head.append(style);
    // html2canvas does not implement object-fit: bake contain into each image first.
    for (const img of doc.images) {
      checkAbort();
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const c = doc.createElement('canvas');
      c.width = Math.ceil(rect.width * 2);
      c.height = Math.ceil(rect.height * 2);
      const g = c.getContext('2d');
      g.fillStyle = getComputedStyle(img).backgroundColor || '#fffdf7';
      g.fillRect(0, 0, c.width, c.height);
      const scale = Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight),
        w = img.naturalWidth * scale,
        h = img.naturalHeight * scale;
      g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      img.src = c.toDataURL('image/jpeg', .96);
      await img.decode();
      c.width = c.height = 1;
    }
    const images = [];
    for (let i = 0; i < pages.length; i++) {
      checkAbort();
      progress(tr`PDF 만드는 중 · ${i + 1}/${pages.length}`);
      pages.forEach((p, j) => p.style.display = j === i ? 'block' : 'none');
      const canvas = await render(pages[i], {
        scale: 1.5,
        backgroundColor: '#fffdf7',
        logging: false
      });
      checkAbort();
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', .94).split(',')[1]), c => c.charCodeAt(0));
      const rect = pages[i].getBoundingClientRect(),
        factor = canvas.width / rect.width;
      const links = [...pages[i].querySelectorAll('[data-book-target]')].flatMap(anchor => {
        const destination = pages.findIndex(page => page.id === anchor.dataset.bookTarget || [...page.querySelectorAll('[id]')].some(el => el.id === anchor.dataset.bookTarget));
        if (destination < 0) return [];
        const box = anchor.getBoundingClientRect();
        return [{
          page: destination,
          x: (box.left - rect.left) * factor,
          y: (box.top - rect.top) * factor,
          width: box.width * factor,
          height: box.height * factor
        }];
      });
      images.push({
        bytes,
        width: canvas.width,
        height: canvas.height,
        links,
        title: pages[i].dataset.pageTitle || (i === 0 ? t("표지") : i === pages.length - 1 ? t("마무리") : t("추억"))
      });
      canvas.width = canvas.height = 1;
    }
    checkAbort();
    await saveFile(jpegPDF(images), 'Then-Us-Memory-Book.pdf');
  } finally {
    frame.remove();
  }
}
