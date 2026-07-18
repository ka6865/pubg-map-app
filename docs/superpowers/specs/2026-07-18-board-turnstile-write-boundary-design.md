# 게시판 Turnstile 쓰기 경계 설계

- 작성일: 2026-07-18
- 기준 보고서: `docs/reviews/2026-07-15-feature-code-review.md` P1 10번
- 대상: 웹 게시판 게시글·댓글 작성
- 운영 제약: Vercel·Supabase 무료 플랜, 외부 유료 rate-limit 서비스 미사용
- 공식 근거: [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Supabase Database Functions](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 1. 문제

현재 브라우저는 `/api/board/turnstile`에서 토큰을 먼저 검증한 뒤 `sessionStorage.turnstile_verified=1`을 저장한다. 실제 게시글·댓글 저장 route는 이 플래그나 Turnstile 토큰을 확인하지 않으므로 공격자가 UI를 건너뛰고 저장 API를 직접 호출할 수 있다. 비회원 요청은 bcrypt와 service-role DB 쓰기를 실행하므로 스팸뿐 아니라 Vercel CPU와 Supabase 무료 용량도 소모한다.

## 2. 채택 설계

Cloudflare Turnstile 토큰은 발급 후 300초 동안 유효하고 한 번만 검증할 수 있다. 따라서 사전 검증과 탭 단위 재사용을 제거하고, 실제 쓰기 요청 body의 `turnstileToken`을 같은 route에서 Siteverify한 뒤 성공한 요청만 저장한다.

독립 `/api/board/turnstile` route는 삭제한다. 검증 로직은 서버 전용 `lib/board/turnstile.server.ts`로 이동해 게시글과 댓글 route가 공유한다. 클라이언트는 토큰을 React 메모리 상태에만 보관하고 요청 후 성공·실패와 관계없이 폐기한다. 토큰과 Cloudflare 원본 오류 응답은 로그·API 응답·DB에 저장하지 않는다.

## 3. 보호 대상 route

- `POST /api/posts/write`
  - 비회원 신규 작성은 `guest_post` Turnstile 검증 필수
  - 회원 작성·회원 수정은 Turnstile 대상이 아님
  - 비회원 수정은 기존처럼 거부
- `POST /api/board/posts`
  - 호환성을 위해 route는 유지하되 모든 요청을 비회원 작성으로 취급하고 `guest_post` 검증 필수
- `POST /api/board/comments`
  - 비회원 댓글은 `guest_comment` Turnstile 검증 필수
  - 회원 댓글도 이 route로 통합해 서버가 JWT user ID와 작성자 정보를 결정
  - 기존 답글·게시글 작성자 notification 생성 동작을 서버에서 유지
- 회원 댓글의 브라우저 직접 Supabase INSERT는 제거한다.

모바일 전용 인증 route는 이미 로그인 필수이며 이번 guest Turnstile 범위에서 변경하지 않는다.

## 4. Siteverify 계약

`verifyTurnstileToken`은 다음을 강제한다.

- `TURNSTILE_SECRET_KEY`가 비어 있으면 외부 호출 전 503
- 토큰은 공백 제거 후 1~2,048자만 허용
- 요청 IP를 `remoteip`으로 Siteverify에 전달
- 5초 timeout, 자동 재시도 없음
- HTTP 비정상 응답·JSON 파싱 실패·네트워크 오류는 503
- `success=true`와 응답 `action`이 route의 기대 action과 모두 일치해야 통과
- invalid·expired·duplicate·action mismatch는 고정된 400 응답
- Cloudflare `error-codes`, token, secret, IP 원문은 사용자 응답이나 로그에 포함하지 않음

위젯은 글에 `guest_post`, 댓글에 `guest_comment` action을 설정한다.

## 5. 원자적 요청 제한

Vercel 인스턴스 메모리는 공유되지 않으므로 인메모리 Map을 보안 경계로 사용하지 않는다. Supabase migration으로 `guest_write_rate_limits`와 `consume_board_write_quota` RPC를 추가한다.

키는 `scope + actor_hash`다.

- 비회원: 서버에서 `sha256(scope + client IP)` 계산
- 회원: 서버에서 `sha256(scope + user ID)` 계산
- 게시글: 60초에 1회
- 댓글: 10초에 1회

RPC는 `INSERT ... ON CONFLICT DO UPDATE ... WHERE`로 window 갱신과 count 증가를 한 statement에서 처리하고 허용 여부를 boolean으로 반환한다. quota가 소진되면 429, RPC 오류·migration 미적용은 503으로 fail-closed 처리한다. malformed body는 quota와 Siteverify 전에 400으로 차단한다. guest 요청은 quota를 먼저 소비해 invalid token 반복으로 Cloudflare 호출과 Vercel 실행을 무제한 발생시키지 못하게 한다.

테이블은 RLS를 활성화하고 공개 policy를 만들지 않는다. `anon`, `authenticated`, `PUBLIC`의 table 권한과 RPC execute를 revoke하고 `service_role`만 명시 허용한다. 함수는 `SECURITY INVOKER`, `SET search_path=''`, 완전 한정 테이블 이름을 사용한다.

rate-limit row는 actor·scope별 한 행만 유지한다. 만료 row 정리는 analytics 보존 정책 작업과 함께 GitHub Actions 기반 운영 cleanup으로 통합하고, 이번 route 요청마다 전체 table scan이나 delete를 실행하지 않는다.

## 6. 데이터 흐름

비회원 글·댓글:

```text
body 크기·필드 검증
→ 선택적 인증 확인
→ IP blacklist 확인
→ 원자적 guest quota 소비
→ 같은 요청에서 Turnstile Siteverify
→ 비속어 검증
→ bcrypt
→ service-role INSERT
→ 토큰 폐기
```

회원 글·댓글:

```text
body 크기·필드 검증
→ JWT user 확인
→ 원자적 user quota 소비
→ 서버 권위 작성자·user_id 결정
→ INSERT
→ 댓글 대상 사용자가 있으면 기존 notification 생성
```

관리자 게시글 수정은 기존 권한 검사를 유지하며 신규 작성 quota 대상에서 제외한다.

## 7. 클라이언트 UX

- 비회원 게시글 작성 화면에 `guest_post` 위젯을 표시한다.
- 토큰이 없으면 저장 요청을 보내지 않고 인증 필요 안내를 표시한다.
- 비회원 댓글은 기존 modal을 유지하되 “탭에서 한 번만” 문구를 제거한다.
- 댓글 위젯 성공 callback은 받은 token으로 즉시 댓글 저장 요청을 한 번 실행한다.
- 요청 완료 후 token을 폐기하고 위젯을 새 instance로 초기화한다.
- 만료·중복·서버 오류 시 사용자가 새 challenge를 받을 수 있게 modal을 닫거나 reset한다.
- 회원에게 Turnstile 위젯을 표시하지 않는다.

## 8. 오류 계약

- 400: malformed body, token 누락·길이 오류, Turnstile 거부·action mismatch
- 401/403: 기존 인증·권한·IP blacklist 거부
- 429: 게시글 또는 댓글 작성 빈도 초과
- 503: Turnstile secret 누락, Siteverify 장애, quota RPC 장애·migration 미적용
- 500: 저장소 내부 오류

사용자 응답은 고정된 한국어 메시지만 사용하고 내부 오류 객체·환경변수·IP·token을 노출하지 않는다.

## 9. 테스트와 검증

- helper 단위 테스트: 누락 secret, 2,048자 상한, timeout/upstream 오류, invalid·duplicate, action mismatch, 정상 remoteip 전달
- route 행위 테스트: direct guest 요청 무토큰 차단, quota 선차단, valid token만 INSERT, 로그인 사용자는 Turnstile 미호출, 회원 댓글 작성자·notification 보존, DB/RPC 오류 fail-closed
- client source/상태 테스트: `sessionStorage.turnstile_verified` 제거, 각 payload에 token 포함, 요청 후 token 폐기, action 구분
- migration source 테스트: RLS, revoke/grant, `SECURITY INVOKER`, 고정 search_path, atomic upsert, scope·count 검증
- 관련 Vitest, `verify:admin`, `verify:core`, 전체 회귀 실행
- 실제 Chrome은 Cloudflare 공식 test sitekey/secret이 로컬에 명시적으로 설정된 경우에만 guest 작성 직전까지 검증한다. 운영 키나 운영 DB를 이용한 게시글·댓글 생성은 수행하지 않는다.

## 10. 배포와 복구

1. `guest_write_rate_limits` migration과 RPC를 Supabase에 먼저 적용한다.
2. Vercel에 기존 `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`가 non-empty인지 확인한다.
3. 애플리케이션을 배포한다.
4. test/preview 환경에서 guest post·comment success, duplicate rejection, 429를 확인한다.

애플리케이션을 먼저 배포하면 quota RPC가 없어 모든 보호 대상 쓰기가 503으로 fail-closed 된다. 문제 발생 시 앱만 이전 버전으로 롤백할 수 있으며 추가된 rate-limit table은 기존 앱 동작에 영향을 주지 않는다. 운영 데이터 삭제는 없다.

## 11. 완료 기준

모든 웹 guest write route가 같은 저장 요청 안에서 single-use Turnstile token을 검증하고, sessionStorage나 독립 verify route로 우회할 수 없으며, 분산 인스턴스 간 원자적 요청 제한과 회귀 테스트가 존재해야 한다. 회원 댓글도 서버 route로 통합돼 클라이언트가 user ID·작성자를 위조하거나 user quota를 우회할 수 없어야 한다.
