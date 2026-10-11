/** Validate a bounded JPEG and strip all APP metadata except JFIF (APP0). */
export function sanitizeJpeg(input) {
  if(!Buffer.isBuffer(input)||input.length<20||input.length>900_000||input[0]!==255||input[1]!==216)throw new Error('JPG 사진만 업로드할 수 있어요.');
  const chunks=[input.subarray(0,2)];let at=2,dimensions=null;
  while(at<input.length){
    if(input[at]!==255)throw new Error('손상된 사진이에요. 다른 사진을 골라 주세요.');
    const start=at;while(input[at]===255)at++;
    const marker=input[at++];
    if(marker===218){
      if(!dimensions||input[input.length-2]!==255||input[input.length-1]!==217)throw new Error('사진 형식을 확인해 주세요.');
      chunks.push(input.subarray(start));return {bytes:Buffer.concat(chunks),...dimensions};
    }
    if(marker===217||at+2>input.length)break;
    const length=input.readUInt16BE(at);
    if(length<2||at+length>input.length)throw new Error('손상된 사진이에요.');
    if([192,193,194].includes(marker)){
      if(length<8)throw new Error('사진 크기를 확인할 수 없어요.');
      const height=input.readUInt16BE(at+3),width=input.readUInt16BE(at+5);
      if(width<1||height<1||width>1600||height>1600)throw new Error('사진은 가로·세로 1600픽셀 이하로 줄여 주세요.');
      dimensions={width,height};
    }
    if(!((marker>=225&&marker<=239)||marker===254))chunks.push(input.subarray(start,at+length));
    at+=length;
  }
  throw new Error('사용할 수 없는 JPG 사진이에요.');
}
