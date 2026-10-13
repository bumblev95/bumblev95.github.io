# Railway 연결 — 그때 우리 v0.3.1

상태: 2026-10-13 Railway 테스트 서버의 실제 배포가 SUCCESS로 완료됐다. 테스트 주소는 https://geuttae-api-test-production.up.railway.app/geuttae-uri/ 이다. API의 HTTPS/CORS/인증, 두 독립 참가자의 실제 JPG 업로드·SSE·재접속·출제 교대·동점 결과·저장 동의에 따른 추억집 전달·종료 후 사진 접근 차단을 확인했다.

2026-10-13 Railway 대시보드와 실행 중인 컨테이너를 점검했다. 계정은 Trial이며 무료 크레딧 정책 범위로 유지한다. 사진 볼륨은 `No Backups`이고 현재 요금제에서는 새 백업·자동 일정·PITR를 만들 수 없다. 컨테이너에서 `/data`와 `/data/geuttae-uri` 권한 0700, 서비스 Node UID 1000, 종료된 네 방의 JPG 파일 0개와 삭제 대기 0개를 확인했다. 점검은 집계 결과만 출력하며 방 코드·접근 키·이야기·사진을 로그에 남기지 않았다. 유료 요금제 전환은 실행하지 않았다.

고정 Pages 연결용 `runtime-config.json`에는 검증된 API origin을 설정한다. 실제 게시 여부는 Pages HTTPS 파일 일치와 브라우저 검사 결과로 확인한다. 사용자의 직접 테스트 성공은 확인했지만 기기 수와 네트워크 조건은 확인되지 않아 실제 휴대폰 두 대 검증 완료로 기록하지 않는다.

## 연결 전 경계

- 이 앱 전용 새 프로젝트/서비스/볼륨만 사용한다. 기존 다른 앱의 프로젝트나 데이터는 재사용하거나 변경하지 않는다.
- Railway 연결 후 먼저 실제 계정, 사용 가능한 플랜/크레딧, 비용 제한을 확인한다. 유료 플랜 전환이나 추가 지출은 별도 사용자 확인 없이 실행하지 않는다.
- 2026-10-11 공식 문서 기준 신규 체험은 최대 30일 또는 $5 크레딧 소진까지이며 이후 Free는 월 $1 크레딧이다. Hobby는 월 US$5에 사용량 US$5가 포함되고 초과 사용량은 추가 과금된다. 무료 상시 운영을 보장하지 않는다. 설정 시 가격과 계정 조건을 다시 확인한다.
- 사진 볼륨에는 자동/수동 백업, 스냅샷, 외부 동기화를 사용하지 않는다. 실제 백업 목록과 일정을 확인해야 하며 코드나 환경변수만으로 백업 제외를 보증하지 않는다.

## 서비스 설정

| 항목 | 설정 |
| --- | --- |
| 저장소 | bumblev95/bumblev95.github.io |
| 초기 검증 브랜치 | codex/geuttae-uri-multiplayer-v030 (PR #4) |
| Build context / root directory | 저장소 루트 (geuttae-uri/server로 좁히지 않음) |
| Builder | Dockerfile |
| Dockerfile path | geuttae-uri/server/Dockerfile.railway |
| Start command | node geuttae-uri/server/src/railway.mjs |
| 전용 비공개 volume mount | /data |
| DATA_DIR | /data/geuttae-uri (Docker 이미지의 /app/data 기본값을 반드시 덮어씀) |
| RAILWAY_RUN_UID | 0 (볼륨 권한 초기화 후 launcher가 UID/GID 1000으로 낮춤) |
| PORT | Railway가 주입하는 값 사용; 공개 도메인의 target port와 일치 |
| Public networking | 서비스 전용 HTTPS 도메인 생성 |
| PUBLIC_ORIGIN | 선택 사항. 없으면 RAILWAY_PUBLIC_DOMAIN으로 정확한 HTTPS origin 구성 |
| Healthcheck path | /api/health |
| Healthcheck timeout | 60초 |
| Replicas / regions | 단일 인스턴스, 단일 리전 |
| Serverless / sleep | 끔. 24시간 만료 정리 작업을 위해 계속 실행 |
| Volume backups | 예약 없음 + 수동 백업 없음 확인 |

`railway.mjs`는 볼륨이나 HTTPS 도메인이 없으면 시작을 중단한다. 사진 저장 위치를 임시 파일시스템으로 자동 대체하지 않는다. 전용 볼륨과 그 안의 앱 디렉터리만 비재귀적으로 소유권/권한을 초기화하고, 네트워크 요청을 받기 전에 root 권한을 내려놓는다. 다른 서비스의 기존 볼륨에 이 launcher를 사용하지 않는다.

Railway 전용 `Dockerfile.railway`는 런처를 기본 명령으로 실행한다. 사진 볼륨은 Railway 서비스의 `/data` 마운트로만 연결하며 Docker 이미지에 별도 `VOLUME`이나 `/app/data` 저장소를 선언하지 않는다. 기존 `Dockerfile`과 `compose.yaml`은 일반 Docker 호스트용으로 유지한다.

초기 테스트 서버의 제한은 최대 20개 방, 방당 2–8명이다. 작은 볼륨에서 운영하는 파일럿을 위한 제한이며 상용 용량 검증은 별도다. 사진은 비공개 API 인증 후 전달한다.

Railway의 상태 확인 호스트는 GET /api/health에만 허용한다. 같은 호스트로 방 생성, 사진 조회, OPTIONS 요청 등을 보내도 허용하지 않는다. 일반 API의 호스트·참가자 인증·CORS 제한을 완화하지 않는다.

기존 railway.json/railway.toml Config as Code는 최신 공식 문서에서 deprecated로 표시되어 이 PR에는 추가하지 않았다. 실제 연결 시 현재 제공되는 서비스 설정 도구 또는 Infrastructure as Code를 사용하고, 생성된 설정을 다시 읽어 확인한다.

## 공개 주소 연결 전 검사

실제 API 도메인이 생성된 후:

```sh
node geuttae-uri/server/tools/check-public-server.mjs https://ACTUAL-API-DOMAIN
```

이 검사는 GET/OPTIONS만 전송하며 방·사진·접근 키를 만들지 않는다. HTTPS 상태, v0.3.1 서버 응답, 캐시 금지, 정확한 Pages CORS, 업로드/인증 헤더와 외부 origin 차단을 확인한다. 통과해도 실제 멀티플레이 준비 완료로 표시하지 않으며 `runtime-config.json`을 자동 수정하지 않는다.

추가로 실제 배포에서 아래를 확인해야 한다.

1. 독립된 두 브라우저로 방 생성 → 초대 → 방장 승인 → 각자 테스트 사진/문제 등록 → 출제자 교대 → 정답/점수 → 종료를 수행한다. 실제 SSE, 재접속, 중복 답변 방지와 출제자 득점 제외를 확인한다.
2. 승인 전/다른 방/퇴장·차단 후 사진 접근을 거절하는지 확인한다.
3. 서버 재시작 후 같은 탭의 세션·점수 복원, 종료/신고 후 실제 파일 삭제, 만료 접근 차단과 정리 작업을 확인한다. 상태 API의 삭제 표기만으로 물리 삭제를 확인했다고 기록하지 않는다.
4. 볼륨의 권한, 백업 제외, 디스크 용량, 크레딧/비용 한도와 서버 상시 실행 상태를 확인한다.
5. 여기까지 통과한 다음 Pages의 `runtime-config.json`에 실제 API origin만 넣고 PR #4 병합/Pages 배포를 검증한다. 키·토큰·비밀값은 넣지 않는다.
6. 휴대폰 두 대에서 가능하면 Wi-Fi/셀룰러로 나눠 실제 플레이를 검증한다. 기존 `DEPLOYMENT.md`의 실기기 기록표를 사용한다.

단일 인스턴스와 볼륨을 쓰므로 서버 재배포 중 짧은 연결 끊김이 생길 수 있다. 이를 무중단 배포라고 설명하지 않는다. 클라이언트 재접속이 복원하는지 확인한다.

## 사진 보관의 한계

앱은 방 생성 후 24시간부터 접근을 차단하고, 종료·신고·만료 시 서버 파일을 삭제한다. 서버 정지, 크레딧 소진에 따른 정지, 저장소 오류 중에는 물리 삭제가 늦어질 수 있다. 클라우드 제공자의 모든 저장 매체/보안 로그/복구 정책까지 이 코드가 통제하는 것은 아니다. 실제 사진을 받기 전 제공자 보관 정책과 운영 모니터링을 확인해야 한다.

## 이번 추가 검증

로컬에서 새 hosting 테스트 10개가 통과했다. 별도 Node 프로세스를 띄워 health 응답 200, 전용 데이터 디렉터리 0700, root → UID/GID 1000 전환, SIGTERM 정상 종료를 확인했다. 기존 37개 테스트와 모바일 브라우저 시나리오를 포함한 최신 전체 결과는 PR #4의 해당 커밋 GitHub Actions를 기준으로 확인한다. Railway 실제 배포 및 실제 휴대폰 두 대 검증은 미실행이다.

## 공식 참고자료

- 가격: https://docs.railway.com/pricing/plans
- 체험 조건: https://docs.railway.com/pricing/free-trial
- 상태 확인 호스트/PORT/볼륨 배포 중단: https://docs.railway.com/deployments/healthchecks
- 볼륨 마운트·런타임 변수·권한: https://docs.railway.com/volumes
- 백업 보관: https://docs.railway.com/volumes/backups
- 설정 파일 전환: https://docs.railway.com/config-as-code/reference

## v0.3.1 추억집 통합 검증

PR #4는 최신 main(v0.2.2)을 병합한 v0.3.1을 포함한다. 초기 검증 브랜치는 기존 codex/geuttae-uri-multiplayer-v030 그대로 유지한다. 실제 사진별 저장 동의, 종료 시 연결된 두 참가자에게 허용된 추억집 전달, 서버 사진·추억집 내용 삭제, 신고/중도 종료 시 저장 제외를 추가 검증한다. 새로고침 후 게임 진행은 복원되지만, 완료된 추억집은 서버 삭제 후 다시 받을 수 없으므로 먼저 파일로 저장해야 한다. 실제 결제와 광고는 아직 연결하지 않는다.
