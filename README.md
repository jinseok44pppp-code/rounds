# Rounds — AI 영어회화 코치

빌드 과정 없는 정적 웹앱입니다. `app/` 폴더를 HTTPS로 호스팅하면 iPad Safari에서 쓸 수 있습니다. 마이크는 HTTPS에서만 동작합니다.

## 구조
- `js/live.js`: Gemini Live API(WebSocket)로 실시간 음성 통화. 마이크 입력은 16kHz로, AI 음성 출력은 24kHz로 처리합니다.
- `js/worklets/playback.js`: 음 높이를 유지한 채 재생 속도를 바꿉니다(WSOLA 방식, 0.7–1.2×).
- `js/prompts.js`: 시나리오, 레벨 테스트, 평가, 복습 노트 프롬프트
- `js/call.js`: 통화 화면, 실시간 교정, 힌트, 통화 후 분석과 레벨·속도 자동 조정
- `js/main.js`: 홈, 회화, 복습(간격 반복), 기록, 설정, 온보딩
- `js/store.js`: localStorage 저장(기기 안에만 보관)

## 사용 모델 (설정 > 고급에서 변경 가능)
- 실시간 대화: `gemini-3.8-live`
- 분석·복습 노트: `gemini-3.8-flash`
- 실시간 교정·힌트: `gemini-3.5-flash-lite`

## 로컬 실행
```
python3 -m http.server 8765 --directory app
```
