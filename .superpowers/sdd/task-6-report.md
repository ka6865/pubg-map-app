# Task 6 보고서: 게시글 삭제 orphan 회수와 URL 정규화

## RED / GREEN

- RED: `tests/board-image-cleanup.test.ts`, `tests/board-post-write-boundary.test.ts`, `tests/board-image-storage-migration.test.ts`에 관리형 URL query/hash 보존과 삭제 trigger 계약을 추가한 뒤 4개 실패를 확인했다.
- GREEN: 공용 `canonicalizeManagedBoardImageUrl`을 추가해 고정 Supabase origin, `board-images-v2`, UUID 단일 path만 query/hash 제거 후 정규화했다. URL 파싱 실패와 다른 origin·bucket·key는 `null`로 차단한다.
- GREEN: 클라이언트 `classifyUploadedBoardImages`와 서버 `getRetainedImageIds`가 같은 공용 정규화 계약을 사용한다. 서버는 기존 DB ref를 순회하면서만 ID를 선택하므로 본문 URL만으로 새 이미지 ID를 승격하지 않는다.

## 게시글 삭제 처리

- `public.posts`의 `BEFORE DELETE` trigger가 삭제될 게시글의 image ID를 수집하고 UUID 오름차순으로 `board_image_objects` 행을 잠근다.
- 다른 게시글 ref가 없는 `ready` 객체만 `delete_pending`, `delete_after = now()`, lease `NULL`로 전이한다. `legacy_retained`는 전이 대상이 아니다.
- trigger 전이는 게시글 삭제와 동일 transaction이므로 삭제 rollback 시 이미지 상태도 rollback된다.
- 회원 직접 삭제, 비회원 삭제 API, 관리자 API를 포함한 모든 `posts` 삭제 경로는 DB trigger 경계를 통과한다. 기존 API route는 변경하지 않았다.

## 잠금·권한 분석

- write, draft promote, claim, trigger 모두 image UUID 오름차순 잠금 계약을 따른다. trigger는 ref를 읽은 뒤 image 행을 잠그며, cascade 이전에 마지막 ref 판정을 `post_id <> OLD.id`로 수행한다.
- claim의 ref 존재 확인은 잠금 없는 읽기이고, write는 image 잠금 후 ref 변경을 수행하므로 trigger와 반대 순환 대기가 생기지 않도록 구성했다.
- trigger 함수는 `SECURITY DEFINER`, `SET search_path = ''`이며 PUBLIC·anon·authenticated EXECUTE 권한을 revoke했다. fixture는 security definer, empty search_path, PUBLIC execute 차단을 검사한다.

## 실제 PostgreSQL fixture 갱신

- 마지막 ref 삭제 후 ref 0 및 `delete_pending` 전이
- 공유 ref 삭제 시 첫 삭제는 `ready` 유지, 마지막 삭제에서 `delete_pending`
- transaction rollback 후 게시글과 `ready` 상태 보존

## 검증 결과

- `npx vitest run tests/board-image-storage-migration.test.ts tests/board-image-cleanup.test.ts tests/board-post-write-boundary.test.ts tests/board-image-write-boundary.test.ts`: 115/115 통과
- `npm run verify:admin`: 265/265 통과
- 대상 ESLint, `npx tsc --noEmit --pretty false`, `git diff --check`: 통과

## 남은 위험

- 로컬 PostgreSQL fixture 실행은 지시대로 수행하지 않았다. 부모 통합 단계에서 `npm run verify:board-image-storage`를 로컬 격리 DB에 재실행해야 한다.

## 보안 리뷰 후속 보완

- 다중 post 삭제의 행 단위 image lock 역전 가능성을 RED 정적 계약으로 재현했다.
- `BEFORE DELETE FOR EACH STATEMENT`, write, promote, global claim, owner claim이 모두 같은 transaction advisory lock을 post/image 행 잠금 전에 획득하도록 통일했다. claim RPC가 반환되면 잠금은 해제되므로 Storage 네트워크 삭제 시간은 직렬화하지 않는다.
- 역순 다중 삭제 경쟁 fixture, trigger function `OWNER TO postgres`, SECURITY DEFINER, empty search path, public 실행 차단 검증을 추가했다.
- URL의 credentials와 percent-encoded UUID path를 차단하고 lowercase raw UUID 단일 path에서 query/hash만 제거하도록 계약을 좁혔다.
- GREEN: 전용 117/117, admin 265/265, ESLint, TypeScript, diff check 통과.
- 로컬 PostgreSQL에 현재 migration을 재적용하고 역순 경쟁을 포함한 전체 fixture를 내부 2회 반복해 통과했다.
- 최종 보안 재리뷰: Critical 0, Important 0, Minor 0, 승인.
