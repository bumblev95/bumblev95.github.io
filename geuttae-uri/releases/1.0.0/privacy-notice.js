import {tr} from './locale.js';

// Readable without leaving the consent form or losing an unsubmitted nickname.
export function entryPrivacyNotice() {
  return tr`<details class="entry-rules entry-privacy"><summary>개인정보 안내 읽기</summary>
<p>그때 우리 / Us Back Then · Bumblev · 개인정보 문의: <a href="mailto:keetojt@gmail.com">keetojt@gmail.com</a></p>
<p>모임 운영을 위해 닉네임, 방 이름, 선택한 축소 사진, 질문·이야기, 답변·점수, 임시 세션 식별자와 신고 기록을 HTTPS로 Railway의 앱 서버에 전송해요. 승인된 모임 참가자에게 게임에 필요한 내용을 보여줘요. 원본 사진은 기기에 남아요.</p>
<p>서버의 임시 사진은 모임 종료·문제 삭제·방장 강퇴 시 삭제해요. 방은 생성 후 최대 24시간에 만료되며, 장애 시 접근을 먼저 막고 물리 삭제를 재시도해요. 별도로 저장에 동의한 사진만 추억집에 포함하며 내려받은 파일은 앱에서 회수하지 못해요.</p>
<p>호스팅 제공자는 서비스 운영과 보안을 위해 네트워크 기록을 처리할 수 있어요. 호스팅 기록·백업의 실제 보관기간은 아직 확인 중이며 출시 전에 공개 정책에 반영해야 해요. 광고·분석 SDK, 실제 결제와 회원 계정은 현재 없어요. 언어 선택은 기기에 저장해요.</p>
<p>삭제·안전 문의는 방 코드와 발생 시각을 위 이메일로 보내 주세요. 민감한 사진이나 방 접근 키는 보내지 마세요. 사진 신고는 방에 임시 기록되며 운영자에게 이메일을 자동 발송하지 않아요.</p></details>`;
}

export function privacyIdentity() {
  return tr`<p>그때 우리 / Us Back Then · Bumblev · 개인정보 문의: <a href="mailto:keetojt@gmail.com">keetojt@gmail.com</a></p>
<p>모임 운영을 위해 닉네임, 방 이름, 선택한 축소 사진, 질문·이야기, 답변·점수, 임시 세션 식별자와 신고 기록을 HTTPS로 Railway의 앱 서버에 전송해요. 승인된 모임 참가자에게 게임에 필요한 내용을 보여줘요. 원본 사진은 기기에 남아요.</p>
<p>호스팅 제공자는 서비스 운영과 보안을 위해 네트워크 기록을 처리할 수 있어요. 호스팅 기록·백업의 실제 보관기간은 아직 확인 중이며 출시 전에 공개 정책에 반영해야 해요. 광고·분석 SDK, 실제 결제와 회원 계정은 현재 없어요. 언어 선택은 기기에 저장해요.</p>`;
}
