/** Validate bounded JPEG marker structure and strip metadata, including between scans. */
export function sanitizeJpeg(input) {
  if(!Buffer.isBuffer(input)||input.length<20||input.length>900_000||input[0]!==255||input[1]!==216)throw new Error('JPG 사진만 업로드할 수 있어요.');
  const chunks=[input.subarray(0,2)];let at=2,dimensions=null,sawScan=false;
  while(at<input.length){
    if(input[at]!==255)throw new Error('손상된 사진이에요. 다른 사진을 골라 주세요.');
    const start=at;while(input[at]===255)at++;
    const marker=input[at++];
    if(marker===217){
      if(!dimensions||!sawScan||at!==input.length)throw new Error('사진 형식을 확인해 주세요.');
      chunks.push(input.subarray(start,at));return {bytes:Buffer.concat(chunks),...dimensions};
    }
    if(marker===0||marker===216||(marker>=208&&marker<=215)||at+2>input.length)throw new Error('사진 형식을 확인해 주세요.');
    const length=input.readUInt16BE(at);
    if(length<2||at+length>input.length)throw new Error('손상된 사진이에요.');
    if([192,193,194].includes(marker)){
      if(length<8)throw new Error('사진 크기를 확인할 수 없어요.');
      const height=input.readUInt16BE(at+3),width=input.readUInt16BE(at+5);
      if(width<1||height<1||width>1600||height>1600)throw new Error('사진은 가로·세로 1600픽셀 이하로 줄여 주세요.');
      dimensions={width,height};
    }
    // Keep the fixed JFIF header without thumbnail; remove every other APP/COM segment.
    const safeJfif=marker===224&&length===16&&input.subarray(at+2,at+7).equals(Buffer.from('JFIF\0'))&&input[at+14]===0&&input[at+15]===0;
    if(!((marker>=224&&marker<=239)||marker===254)||safeJfif)chunks.push(input.subarray(start,at+length));
    at+=length;
    if(marker!==218)continue;
    if(!dimensions||length<6)throw new Error('사진 형식을 확인해 주세요.');
    sawScan=true;const entropyStart=at;let boundary=-1;
    for(let i=at;i<input.length;i++){
      if(input[i]!==255)continue;
      let j=i+1;while(input[j]===255)j++;
      if(input[j]===0||(input[j]>=208&&input[j]<=215)){i=j;continue;}
      boundary=i;break;
    }
    if(boundary<0)throw new Error('손상된 사진이에요.');
    chunks.push(input.subarray(entropyStart,boundary));at=boundary;
  }
  throw new Error('사용할 수 없는 JPG 사진이에요.');
}
