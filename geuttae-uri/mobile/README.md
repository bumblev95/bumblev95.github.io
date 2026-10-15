# 그때 우리 Android TEST

기존 웹 클라이언트를 로컬로 묶은 Capacitor 8 앱입니다. 앱을 열 때 원격 웹 코드를 내려받지 않으며, 기존 Railway 서버와 같은 게임 방을 사용합니다. AI는 출시 예정 안내만 보이며 호출하지 않습니다. 앱의 로컬 HTTPS hostname은 기존 서버가 허용하는 `bumblev95.github.io`이며, 해당 호스트의 UI 요청은 Capacitor가 APK 안의 파일로 처리합니다. 서버 CORS 설정 변경 없이 기존 API에 연결합니다.

- 앱 ID: `com.bumblevai.thenus.test` (정식 앱과 나란히 설치할 테스트 패키지)
- 버전: `0.5.0` / versionCode `500`
- Android 7.0(API 24) 이상, 최신 Android System WebView 권장
- 초대: 네이티브 공유 창에 웹 초대 링크 제공; 설치하지 않은 친구도 웹으로 입장
- 파일: Android 저장 위치 선택 창(`ACTION_CREATE_DOCUMENT`)으로 PDF/HTML 내보내기. 저장을 취소하면 성공 안내 없음
- 사진: 시스템 파일 선택기, 광범위한 사진첩/저장소/카메라 권한 없음
- 백그라운드 복귀 시 서버 상태 재연결. 게임 시간은 앱을 나가도 계속 흐름
- 뒤로가기: 열려 있는 창 닫기 → 모임에서 홈으로 가기 확인 → 홈에서 앱 종료
- 결제·광고 SDK 없음; 포토북 무료 테스트. 스토어 공개 배포는 아직 하지 않음

## 빌드

Node 22+, Java 21, Android SDK 36과 Build Tools 36.0.0을 설치합니다.

```sh
cd geuttae-uri/mobile
npm ci
npm run sync
npm test
cd android
./gradlew assembleDebug lintDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions의 **Then Us Android APK** 실행에서도 APK를 받을 수 있습니다. 디버그 서명은 테스트용이며 Play Store 출시에는 정식 앱 ID, 릴리스 서명과 별도 심사가 필요합니다. 서명 키를 저장소에 넣지 마세요.

사진·문제·세션 키를 네이티브 영구 저장소에 복제하지 않습니다. 서버 사본 삭제와 포토북 동의 규칙은 웹과 같습니다. 앱 프로세스 종료 후 저장하지 않은 추억집을 복원하지 못하므로 완료 화면에서 파일로 내보내야 합니다.

`thenus://room?code=ABCDEFGH` 형태의 선택적 앱 열기 스킴은 방 코드만 읽습니다. 웹 링크 자동 열기(검증된 App Links)는 아직 설정하지 않았습니다. 웹과 앱의 세션은 서로 분리되며 입장 승인을 각각 받아야 합니다.
