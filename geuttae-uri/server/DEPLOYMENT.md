# 그때 우리 v0.3.1 서버 연결

GitHub Pages는 프런트엔드를 계속 제공하며 API와 비공개 사진은 별도 Node 22.13+ 서버에서 처리한다. v0.3.3은 기본 비활성인 텍스트 기반 AI 초안과 이용권 원장을 준비한다. 실제 결제는 꺼져 있으며 [COMMERCE.md](COMMERCE.md)의 계정·스토어·저장소 조건을 먼저 완성해야 한다. 실제 호출 승인·비밀 키·모델·비용 제한은 [AI.md](AI.md)를 따른다.

## 구현과 외부 설정의 경계

| 항목 | 상태 |
| --- | --- |
| 방 코드·초대 링크, 2–8명, 방장 승인, 실시간 진행·출제자 교대·점수 | 코드 구현 및 로컬 실제 HTTP/SSE 검증 |
| 사진 소유자 검증, 승인 전 차단, 타 방 접근 차단, 공개 전 정답 숨김 | 자동 검증 |
| 24시간 방 만료, 종료 시 사진 삭제, 30초 정리, 재시작 복원 | 자동 검증; 서버가 실행돼야 물리 삭제 가능 |
| HTTPS API 호스팅·도메인·지속 실행·비공개 볼륨 | Railway 실제 배포 SUCCESS 및 운영 점검 완료; RAILWAY.md 참고 |
| GitHub Pages에 API 주소 연결 | 검증된 origin 설정; 실제 게시 여부는 해당 커밋의 Pages 검사를 기준으로 확인 |
| 독립된 두 모바일 브라우저의 별도 HTTPS 프런트/API 테스트 | GitHub CI 통과; 실제 휴대폰은 별도 확인 |
| 실제 휴대폰 두 대의 인터넷 접속 | 미검증 |

## 서버 계약

- 인스턴스 **한 개**만 운영한다. 방별 잠금과 SSE 연결은 단일 프로세스 안에서 관리된다. 여러 replicas/serverless 함수로 실행하지 않는다.
- 영속 비공개 디렉터리를 `DATA_DIR`로 지정한다. Node 실행 계정 외 접근을 제한하고, 사진 디렉터리를 웹 서버나 CDN에 노출하지 않는다.
- 이 임시 데이터 볼륨은 자동 백업·스냅샷에서 제외해야 한다. 예를 들어 [Render 영속 디스크](https://render.com/docs/disks#disk-snapshots)는 일일 스냅샷을 최소 7일 보관하므로, 그 디스크에 사진을 그대로 저장하는 설정은 24시간 사진 보관 약속을 충족하지 않는다. 해당 방식은 이 제공 템플릿의 대상이 아니다.
- `PUBLIC_ORIGIN=https://실제-API-호스트`에는 경로 없이 정확한 HTTPS origin을 넣는다. 서버가 전달받는 Host와 일치해야 한다.
- `FRONTEND_ORIGINS=https://bumblev95.github.io`를 설정한다. 임의 origin, 와일드카드 CORS, 공개 사진 URL을 허용하지 않는다.
- HTTP 프록시는 SSE 스트림을 버퍼링하지 않아야 한다. 15초 heartbeat를 허용하고 idle timeout을 60초 이상으로 둔다.
- 서버는 항상 실행한다. 정리 작업은 30초마다 실행되고 시작 시에도 실행된다. 방 생성 후 24시간부터 API·사진 접근은 즉시 거부된다. 서버 정지·파일 삭제 장애 중에는 물리 삭제가 늦어질 수 있으므로 운영 모니터링이 필요하다. 모든 저장 매체의 보관기간까지 이 코드만으로 보증하지 않는다.
- Railway 런처는 최대 20개의 임시 방과 방당 최대 8명을 허용한다. 일반 서버의 기본 100개 제한과 구분한다. 상용 규모·상시 신고 검토·AI 분석은 별도 범위다.

## 실행

런타임에는 npm 패키지가 필요 없다. 테스트 도구만 devDependency다.

```sh
cd geuttae-uri/server
node --test tests/*.test.mjs
node src/server.mjs
```

로컬 주소: `http://localhost:3000/geuttae-uri/`. 같은 Wi-Fi에서 테스트할 때는 `HOST=0.0.0.0`으로 실행하고 해당 PC의 LAN IP로 접속한다. 원본 사진을 쓰는 공개 테스트는 HTTPS 배포 후 진행한다.

Docker 지원 서버와 API 도메인이 있다면 저장소 루트 기준의 `Dockerfile`과 `compose.yaml`을 사용할 수 있다. API 도메인의 DNS를 서버에 연결한 뒤:

```sh
QUIZ_DOMAIN=실제-API-도메인 docker compose -f geuttae-uri/server/compose.yaml up -d --build
```

`Caddyfile`은 TLS와 SSE 프록시를 구성한다. 방 데이터 볼륨은 코드·사진 Git 저장소와 별개다. 이 템플릿의 배포, HTTPS 인증서 발급, 볼륨의 백업 제외 설정은 아직 실운영 확인되지 않았다.

## 고정 GitHub Pages 주소 연결

1. 실제 서버의 `/api/health`에서 버전 `0.3.1`과 `ok: true`를 확인한다.
2. 별도 프런트 origin의 OPTIONS, 승인 전 접근 차단, 실제 업로드, 실시간 진행, 만료 정리를 확인한다.
3. `geuttae-uri/runtime-config.json`의 `apiBase`를 실제 HTTPS origin으로 변경한다. **접근 키나 관리자 비밀값을 넣지 않는다.**
4. 검증된 PR을 병합하고 고정 주소 `https://bumblev95.github.io/geuttae-uri/`의 파일 일치와 렌더링 검사를 확인한다. 현재 릴리스의 channel은 `친구와 추억집 연결 체험판`이며 `runtime-config.json`은 검증된 Railway API origin을 사용한다. 게시 전에는 고정 주소의 업데이트 완료를 주장하지 않는다.
5. 서로 다른 휴대폰 두 대와 가능하면 Wi-Fi/셀룰러의 서로 다른 네트워크로 아래 실기기 검증을 수행한다.

## 실기기 검증 기록 — 아직 미실행

| 절차 | 기대 결과 | 실제 결과 |
| --- | --- | --- |
| A가 방을 만들고 링크를 B에게 공유 | B는 같은 코드로 입장 요청 | 미실행 |
| A 승인 전 B의 사진·문제 접근 | 모두 차단 | 미실행 |
| 승인 후 각 휴대폰 사진으로 한 문제 등록 | 각자 준비 표시가 동기화 | 미실행 |
| A의 문제에서 B가 정답 제출 | A는 답변 불가·0점, B만 100점 | 미실행 |
| B의 문제에서 A가 정답 제출 | 출제자 교대, A만 100점 | 미실행 |
| 같은 답을 연속 제출·오래된 round 재전송 | 한 번만 반영, 중복·오래된 요청 거절 | 미실행 |
| B 새로고침·네트워크 전환 후 재접속 | 같은 탭의 승인·점수·진행 복원 | 미실행 |
| 승인되지 않은 C·다른 방에서 사진 접근 | 차단 | 미실행 |
| 종료·신고·24시간 경과 | 사진 접근 차단 및 실제 서버 파일 제거 | 미실행 |
| 게임 중 새 버전 발견 | 적용 버튼 잠김, 종료 뒤 해제 | 미실행 |

## 접근 키와 사진

초대 URL에는 방 코드만 들어간다. 서버는 참가자마다 256비트 접근 키를 생성하고 디스크에는 SHA-256 해시만 저장한다. 클라이언트는 해당 탭의 sessionStorage에 방 접근 키만 저장하고 API/SSE/사진 요청에 Authorization 헤더를 사용한다. 다른 탭·브라우저·휴대폰은 새 참가자로 승인받아야 한다. 사진은 인증된 fetch 후 메모리의 blob URL로 표시하고 종료·퇴장·권한 변경 시 해제한다. 브라우저의 원본 파일은 변경하지 않는다.

축소 JPG는 클라이언트 canvas에서 다시 생성하고 서버에서도 JPEG 크기·형식과 메타데이터 제거를 검증한다. 사진·질문·접근 키를 요청 로그에 기록하지 않는다. 앱은 캐시를 금지하지만 승인된 참가자의 캡처나 별도 다운로드까지 막을 수는 없다.

## Integrated v0.3.1 memory-book acceptance

Deploy PR #4 at its latest integrated commit, not the old v0.3.0 commit. The runtime-config names the verified Railway API origin. Both consented and denied test photos must be used. Verify that only consented, revealed memories reach both connected approved players at completed finish; media files and saved transcripts are gone; fresh state/reconnect never replay the book. Report/end must not export. After finish, explicitly save before home/reload/tab close. No real purchase, membership or reward-ad entitlement is enabled.
