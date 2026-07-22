# Task 5: 게시판 이미지 bounded cleanup 보고서

## RED 증거

- `npx vitest run tests/board-image-cleanup-job.test.ts tests/board-image-promote-boundary.test.ts`를 구현 전 실행했다.
- 결과: cleanup script/workflow와 `promotionRevision` 모듈 부재로 cleanup 4건 실패, promote suite import 실패. 실패 원인은 요구한 산출물 부재였다.

## 변경

- `scripts/cleanup_board_images.ts`는 전역 `claim_board_image_deletions` RPC만 20개씩 호출하고 최대 5 batch, 시작 30초 뒤 신규 batch 금지, 순차 Storage remove/finalize를 구현했다.
- Storage 성공과 not found/404만 finalize(true)이며 반환 오류·throw는 finalize(false)이다. claim/finalize RPC 오류와 계약 위반은 fail closed한다.
- stdout은 배치·claim·finalize·deferred·backlog 안전 집계만 기록한다. key, lease token, 원본 오류, credential은 출력하지 않는다.
- daily workflow에 `needs` 없는 독립 `board-image-cleanup` job을 추가했다. timeout 5분, 단일 concurrency, 기존 Supabase secrets만 사용하며 운영 활성화 전 `if: ${{ false }}`다.
- Task 4 Minor 보강으로 부모 revision 선택을 순수 함수로 분리해 shadow parent revision, 부모 오류·누락·비정상 null, 신규 draft 자신의 revision을 행위 테스트했다.

## 검증

- 전용 Vitest: 2개 파일, 19개 테스트 통과
- `npm run verify:admin`: 12개 파일, 263개 테스트 통과
- 대상 ESLint: 오류 0, 경고 0
- `npx tsc --noEmit --pretty false`: 통과
- `git diff --check`: 통과

## 배포 gate와 남은 위험

- 운영 Supabase migration을 먼저 적용한다.
- `board-images-v2` bucket/policy를 확인한다.
- Preview에서 member signed upload·작성·수정·취소 QA를 수행한다.
- 기존 `images` 객체 7개가 보존되는지 확인한다.
- 비활성 job을 활성화하기 전에 수동 dry-run을 수행한다.
- 운영 migration·Storage 삭제·workflow 실행은 이 작업에서 수행하지 않았다. 전체 통합 검증은 부모 작업에서 수행한다.
