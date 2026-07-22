# 게시판 이미지 Storage 소유권·참조 경계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시글 HTML을 삭제 권한의 근거로 사용하지 않고, 신규 게시판 이미지를 서버가 예약한 객체와 DB 참조로 관리해 타인 이미지 삭제 BOLA와 수정·승격 실패 중 데이터 유실을 차단한다.

**Architecture:** 신규 공개 읽기 버킷 `board-images-v2`에는 서버가 발급한 2시간 signed upload token으로만 업로드한다. `board_image_objects`와 `board_post_image_refs`가 소유권·상태·본문/썸네일 참조를 기록하고, service-role 전용 `SECURITY INVOKER` RPC가 게시글 revision과 참조 전이를 원자 처리한다. 실제 Storage 삭제는 DB 커밋 이후 lease claim을 얻은 객체만 수행하며 실패하면 보존·재시도한다. 기존 `images` 버킷 객체 7개는 `legacy_retained`로만 등록해 자동 삭제하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase PostgreSQL 17/Storage, GitHub Actions, 임시 PostgreSQL 15+

## Global Constraints

- Vercel, Supabase, Cloudflare R2 무료 플랜만 사용하며 신규 유료 서비스와 Vercel Cron을 추가하지 않는다.
- 운영 Supabase/R2 데이터 쓰기·삭제·migration 적용은 하지 않는다. 운영 점검은 SELECT만 허용한다.
- 기존 `images` 객체와 URL은 보존하고 소유권을 추정하거나 자동 삭제하지 않는다.
- 사용자 HTML URL, 요청 body의 `user_id`, 파일명은 소유권 근거로 사용하지 않는다.
- 신규 업로드 key는 서버가 생성하고 `upsert=false`로 고정한다.
- signed upload token, service-role key, 원본 Storage/Supabase 오류를 로그·응답에 노출하지 않는다.
- 신규 공개 schema 테이블은 RLS를 활성화하고 공개 policy를 만들지 않는다.
- RPC는 `SECURITY INVOKER`, `SET search_path=''`, 완전 한정 이름을 사용하고 `PUBLIC`, `anon`, `authenticated` 실행 권한을 회수한 뒤 `service_role`만 실행할 수 있다.
- DB 참조 갱신 또는 게시글 갱신이 실패하면 Storage 삭제를 호출하지 않는다.
- Storage SDK의 반환 `{ error }`를 반드시 검사하고 삭제 실패는 객체를 보존한 채 재시도 상태로 복구한다.
- 삭제 배치는 20개 이하, lease는 5분, pending TTL은 24시간으로 제한한다.
- 사용자 백업 문서 `docs/reviews/2026-07-15-feature-code-review.pre-merge-user-backup.md`는 stage·수정·삭제하지 않는다.

---

### Task 1: 관리형 이미지 schema·권한·원자 RPC

**Files:**
- Create via Supabase CLI: migration filename emitted by Task 1 Step 3 for `board_image_storage_ownership`
- Create: `tests/board-image-storage-migration.test.ts`
- Create: `scripts/verify_board_image_storage_migration.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `public.board_image_objects(id, bucket_id, storage_key, owner_user_id, status, expected_mime_type, max_bytes, expires_at, delete_after, delete_lease_until, delete_attempts, created_at, updated_at)`
- Produces: `public.board_post_image_refs(post_id, image_id, usage)` where `usage IN ('content','thumbnail')`
- Produces: `posts.revision bigint NOT NULL DEFAULT 0`
- Produces: `reserve_board_image_upload(p_owner_user_id uuid, p_expected_mime_type text, p_max_bytes bigint)`
- Produces: `complete_board_image_upload(p_image_id uuid, p_owner_user_id uuid)`
- Produces: `write_board_post_with_images(p_post_id bigint, p_actor_user_id uuid, p_expected_revision bigint, p_title text, p_content text, p_category text, p_image_url text, p_is_notice boolean, p_author text, p_user_id uuid, p_password_hash text, p_ip_address text, p_discord_url text, p_discord_channel_id text, p_clan_info jsonb, p_content_image_ids uuid[], p_thumbnail_image_id uuid)`
- Produces: `claim_board_image_deletions(p_limit integer, p_now timestamptz, p_lease_seconds integer)`
- Produces: `finalize_board_image_deletion(p_image_id uuid, p_lease_token uuid, p_deleted boolean)`
- Produces: `backfill_legacy_board_image_references()` migration-local data block; 결과 status는 항상 `legacy_retained`

- [ ] **Step 1: migration 계약 RED 테스트 작성**

`tests/board-image-storage-migration.test.ts`에 migration source를 읽어 다음을 각각 독립 테스트로 작성한다.

```ts
expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.board_image_objects");
expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.board_post_image_refs");
expect(sql).toContain("ALTER TABLE public.board_image_objects ENABLE ROW LEVEL SECURITY");
expect(sql).toContain("ALTER TABLE public.board_post_image_refs ENABLE ROW LEVEL SECURITY");
expect(sql).toMatch(/SECURITY INVOKER/g);
expect(sql).toContain("SET search_path = ''");
expect(sql).toContain("REVOKE ALL ON FUNCTION");
expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
expect(sql).toContain("TO service_role");
expect(sql).toContain("legacy_retained");
expect(sql).toContain("delete_lease_until");
expect(sql).not.toMatch(/GRANT .* TO (anon|authenticated)/);
```

live policy 이름을 정확히 제거하는 계약도 고정한다.

```ts
expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated Users Insert" ON storage.objects');
expect(sql).toContain('DROP POLICY IF EXISTS "Delete Policy" ON storage.objects');
expect(sql).toContain("board-images-v2");
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-image-storage-migration.test.ts`

Expected: migration과 검증 script가 없어 실패한다.

- [ ] **Step 3: Supabase CLI로 migration 파일 생성**

Run: `HOME=/private/tmp/supabase-home supabase migration new board_image_storage_ownership`

Expected: `supabase/migrations/` 아래에 `board_image_storage_ownership.sql` 접미사를 가진 파일이 정확히 1개 생성된다. CLI가 출력한 실제 경로를 이후 명령에 사용한다.

- [ ] **Step 4: schema·Storage policy 구현**

migration에 다음 계약을 구현한다.

```sql
CREATE TABLE IF NOT EXISTS public.board_image_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  storage_key text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending','ready','delete_pending','deleting','deleted','legacy_retained')),
  expected_mime_type text,
  max_bytes bigint CHECK (max_bytes IS NULL OR (max_bytes > 0 AND max_bytes <= 1572864)),
  expires_at timestamptz,
  delete_after timestamptz,
  delete_lease_until timestamptz,
  delete_lease_token uuid,
  delete_attempts integer NOT NULL DEFAULT 0 CHECK (delete_attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, storage_key)
);

CREATE TABLE IF NOT EXISTS public.board_post_image_refs (
  post_id bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.board_image_objects(id) ON DELETE CASCADE,
  usage text NOT NULL CHECK (usage IN ('content','thumbnail')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, image_id, usage)
);
```

`storage.buckets`에는 `board-images-v2`, public read, 1,572,864 byte, `image/png`, `image/jpeg`, `image/webp` allowlist를 idempotent하게 반영한다. 신규 버킷의 anon/authenticated INSERT·UPDATE·DELETE policy는 만들지 않는다. 기존 `images`의 `Public Access` SELECT는 보존하고 live의 board 전용 INSERT·DELETE policy만 정확한 이름으로 제거한다.

- [ ] **Step 5: 원자 RPC 구현**

예약 RPC는 호출자가 넘긴 owner를 신뢰하는 공개 API가 아니라 service-role route가 호출하는 내부 함수다. UUID key를 서버 DB에서 생성하고 다음 구조를 반환한다.

```sql
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text)
```

`complete_board_image_upload`은 `storage.objects`에서 정확한 bucket/key 객체가 존재하고 MIME·size 상한을 만족할 때만 `pending → ready`로 전이한다. `write_board_post_with_images`는 기존 post 수정이면 row를 `FOR UPDATE`로 잠그고 현재 `revision`을 비교하며, 새 글이면 post와 refs를 같은 transaction에서 생성한다. 불일치는 명시적 결과 코드 `revision_conflict`를 반환하며 post, ref, delete 상태를 바꾸지 않는다. route에서 검증·정제한 필드만 typed parameter로 전달하고, 수정 시 actor가 post owner이거나 현재 `profiles.role='admin'`인지 함수가 다시 확인한다. 신규 ref는 actor가 소유한 `ready` 객체 또는 기존 post ref만 허용한다. 마지막 ref가 제거된 관리형 객체만 `delete_pending`으로 전이하고 `legacy_retained`는 절대 전이하지 않는다.

claim은 `FOR UPDATE SKIP LOCKED`, 최대 20개, 5분 lease token을 사용한다. finalize 성공은 registry row를 `deleted`로 남기고, 실패는 `delete_pending`, `delete_after = now() + interval '1 day'`로 복구한다.

- [ ] **Step 6: 임시 PostgreSQL 검증 script 작성**

`scripts/verify_board_image_storage_migration.ts`는 운영과 분리된 DB URL만 받고 다음을 실패 시 non-zero로 종료한다.

```text
RLS 활성 / 공개 policy 0 / anon·authenticated 접근 거부 / service_role 실행 가능
첫 reserve 성공 / 타 owner complete 실패 / MIME·size 위반 실패
같은 image의 content+thumbnail 또는 두 post ref 중 하나 제거 시 삭제 후보 0
마지막 ref 제거 시 delete_pending 1회
legacy_retained ref 제거 시 삭제 후보 0
revision conflict 시 post·ref·status 불변
두 세션 attach-vs-detach 경쟁 후 ready ref 또는 delete_pending 중 하나만 성립
두 worker claim 시 같은 image를 중복 claim하지 않음
finalize 실패 후 24시간 재시도 상태 복구
```

- [ ] **Step 7: 검증과 커밋**

Run:

```bash
npx vitest run tests/board-image-storage-migration.test.ts
npm run verify:admin
npx eslint tests/board-image-storage-migration.test.ts scripts/verify_board_image_storage_migration.ts
npx tsc --noEmit --pretty false
git diff --check
```

Expected: 모두 통과하고 운영 DB 변경은 0건이다.

Commit: `fix: 게시판 이미지 소유권 저장 경계 구축`

---

### Task 2: signed upload 예약·완료·삭제 lease API

**Files:**
- Create: `lib/board/imageStorageContract.ts`
- Create: `lib/board/imageStorage.server.ts`
- Create: `app/api/board/images/reserve/route.ts`
- Create: `app/api/board/images/complete/route.ts`
- Create: `app/api/board/images/release/route.ts`
- Create: `tests/board-image-storage-api.test.ts`

**Interfaces:**
- Produces: `BOARD_IMAGE_BUCKET = "board-images-v2"`
- Produces: `BOARD_IMAGE_MAX_BYTES = 1_572_864`, `BOARD_IMAGE_MAX_BATCH = 20`
- Produces: `reserveBoardImageUpload(input): Promise<{ imageId; bucketId; storageKey; token; publicUrl }>`
- Produces: `completeBoardImageUpload(input): Promise<{ imageId; publicUrl }>`
- Produces: `releaseBoardImages(input): Promise<{ released: number; deferred: number }>`

- [ ] **Step 1: route·helper RED 테스트 작성**

다음 행위를 독립 테스트한다.

```text
무인증 reserve/complete/release는 401
guest와 타 user imageId는 403 또는 404 고정 응답
지원하지 않는 MIME·1.5MB 초과·0 byte·추가 필드는 400
reserve가 DB 반환 key에 대해서만 createSignedUploadUrl(key, { upsert:false }) 호출
signed token과 Supabase 원본 오류를 응답·로그에 포함하지 않음
complete가 DB의 storage.objects 검증 RPC 성공 후에만 public URL 반환
release는 최대 20개 UUID만 허용
Storage remove의 반환 error가 있으면 finalize(false), 성공이면 finalize(true)
DB claim 실패 또는 빈 claim이면 Storage remove 0회
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-image-storage-api.test.ts`

Expected: 신규 module/route가 없어 실패한다.

- [ ] **Step 3: 계약·서버 helper 최소 구현**

모든 route는 `withAuthGuard()`의 JWT user만 사용한다. reserve request는 `{ mimeType, byteSize }`, complete는 `{ imageId }`, release는 `{ imageIds }`만 허용한다. UUID/MIME/byte/batch를 먼저 검증한다.

```ts
const { data: signed, error } = await supabaseAdmin.storage
  .from(BOARD_IMAGE_BUCKET)
  .createSignedUploadUrl(storageKey, { upsert: false });
```

Storage 오류 시 예약 row를 delete하지 않고 24시간 pending TTL 정리 대상으로 남기며 고정 503만 반환한다.

- [ ] **Step 4: GREEN·정적 검증·커밋**

Run:

```bash
npx vitest run tests/board-image-storage-api.test.ts
npx eslint lib/board/imageStorageContract.ts lib/board/imageStorage.server.ts app/api/board/images/reserve/route.ts app/api/board/images/complete/route.ts app/api/board/images/release/route.ts tests/board-image-storage-api.test.ts
npx tsc --noEmit --pretty false
git diff --check
```

Commit: `fix: 게시판 이미지 signed upload API 추가`

---

### Task 3: 게시글 저장과 이미지 ref 원자 경계 결합

**Files:**
- Modify: `app/api/posts/write/route.ts`
- Modify: `components/board/BoardWriteClient.tsx`
- Modify: `components/BoardWrite.tsx`
- Modify: `lib/board-image-cleanup.ts`
- Create: `tests/board-image-write-boundary.test.ts`
- Modify: `tests/board-image-cleanup.test.ts`

**Interfaces:**
- Consumes: Task 1 `write_board_post_with_images`
- Consumes: Task 2 reserve/complete/release API
- Produces: post write body `expectedRevision`, `contentImageIds`, `thumbnailImageId`
- Produces: upload state `{ imageId, publicUrl }[]`; HTML URL은 표시용이며 imageId가 권한 근거다.

- [ ] **Step 1: 클라이언트·write route RED 테스트 작성**

```text
BoardWrite에 `supabase.storage.from("images").upload/remove`가 없음
guest에게 이미지 업로드 control이 disabled이고 서버 요청 0회
member upload는 reserve → uploadToSignedUrl → complete 순서
각 단계 실패 시 이후 단계 중단, token은 상태·로그에 저장하지 않음
취소·unused 정리는 release API만 호출하고 언마운트에서 네트워크 삭제하지 않음
write body는 URL 목록이 아니라 imageId 목록과 expectedRevision을 포함
타인 imageId/미완료 imageId/revision conflict는 post update와 Storage remove 0회
동일 객체가 content+thumbnail에 남으면 삭제 후보가 아님
DB update/ref transaction 성공 후에만 lease 삭제 helper 호출
기존 `images` URL만 있는 글 수정은 URL을 보존하며 물리 삭제 0회
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-image-write-boundary.test.ts tests/board-image-cleanup.test.ts`

- [ ] **Step 3: signed upload 클라이언트 구현**

`BoardWriteClient`의 `user?.id`를 `BoardWrite`에 전달하고 guest면 이미지 control을 비활성화한다. 압축 후 실제 `compressedFile.size/type`으로 reserve하고 다음 순서를 지킨다.

```ts
const reservation = await reserveBoardImage(compressedFile);
await supabase.storage
  .from(reservation.bucketId)
  .uploadToSignedUrl(reservation.storageKey, reservation.token, compressedFile, {
    contentType: compressedFile.type,
    cacheControl: "31536000",
    upsert: false,
  });
const completed = await completeBoardImage(reservation.imageId);
```

각 Supabase 반환의 `error`를 검사한다. 기존 `uploadedImagesRef<string[]>`는 `{ imageId, publicUrl }[]` registry로 교체한다.

- [ ] **Step 4: post write RPC 경계 구현**

수정 조회 projection에 `revision`을 추가한다. 새 글과 수정은 route 검증 후 `write_board_post_with_images` 하나로 post와 refs를 같은 transaction에서 반영한다. 함수 결과 코드를 409/403/503으로 매핑하고, RPC 실패 시 물리 삭제를 호출하지 않으며 고정 오류를 반환한다. 기존 HTML diff → service-role `.remove()` 블록은 완전히 제거한다.

새 글 insert와 수정 update는 최종적으로 post+refs를 한 transaction으로 처리하는 RPC로 이동한다. 중간 호환 구현으로 두 단계 저장을 허용하지 않는다.

- [ ] **Step 5: GREEN·회귀·커밋**

Run:

```bash
npx vitest run tests/board-image-write-boundary.test.ts tests/board-image-cleanup.test.ts tests/board-post-write-boundary.test.ts tests/board-guest-turnstile.test.ts
npm run verify:admin
npx eslint app/api/posts/write/route.ts components/board/BoardWriteClient.tsx components/BoardWrite.tsx lib/board-image-cleanup.ts tests/board-image-write-boundary.test.ts tests/board-image-cleanup.test.ts
npx tsc --noEmit --pretty false
rg -n 'storage\.from\("images"\)\.(upload|remove)|storage\.from\("images"\)' components/BoardWrite.tsx app/api/posts/write/route.ts
git diff --check
```

Expected: 검색 결과 0건.

Commit: `fix: 게시글 이미지 참조를 원자 저장 경계에 결합`

---

### Task 4: 초안 승격 ref 이전과 안전 삭제

**Files:**
- Modify: Task 1 migration의 `merge_board_post_draft_with_images` 함수
- Modify: `app/api/posts/promote/route.ts`
- Modify: `tests/security.test.ts`
- Create: `tests/board-image-promote-boundary.test.ts`

**Interfaces:**
- Produces: `merge_board_post_draft_with_images(p_draft_post_id bigint, p_actor_user_id uuid, p_expected_parent_revision bigint)`
- Consumes: Task 2 lease 삭제 helper

- [ ] **Step 1: promote RED 테스트 작성**

```text
기존 HTML old/new diff와 `images.remove` 호출이 없음
비관리 legacy URL 제거는 Storage remove 0회
parent·draft·refs를 한 RPC가 갱신하고 draft 삭제까지 원자 처리
parent revision conflict는 409이며 Discord와 Storage 호출 0회
RPC 실패는 Discord와 Storage 호출 0회
성공 후에만 Discord를 한 번 호출
마지막 ref만 delete_pending이며 content/thumbnail 잔존 ref는 보존
동시 승격은 한 요청만 성공
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/board-image-promote-boundary.test.ts tests/security.test.ts`

- [ ] **Step 3: RPC·route 최소 구현**

RPC는 parent와 draft를 작은 id부터 `FOR UPDATE`로 잠그고 parent revision을 확인한다. parent 본문 갱신, draft ref의 parent 이전, 기존 parent ref 제거·delete_pending 계산, shadow draft 삭제를 한 transaction으로 수행한다. route는 RPC 성공 후에만 소량 delete drain과 Discord 알림을 실행한다. 모든 `console.log`, 원본 오류·사용자 ID 로그를 제거한다.

- [ ] **Step 4: GREEN·커밋**

Run:

```bash
npx vitest run tests/board-image-promote-boundary.test.ts tests/security.test.ts
npm run verify:admin
npx eslint app/api/posts/promote/route.ts tests/board-image-promote-boundary.test.ts tests/security.test.ts
npx tsc --noEmit --pretty false
rg -n 'storage\.from\("images"\)|oldImages|deletedImages' app/api/posts/promote/route.ts
git diff --check
```

Commit: `fix: 게시판 초안 승격 이미지 참조 원자화`

---

### Task 5: bounded cleanup·문서·통합 검증

**Files:**
- Create: `scripts/cleanup_board_images.ts`
- Modify: `.github/workflows/daily-tasks.yml`
- Modify: `package.json`
- Modify: `docs/reviews/2026-07-15-feature-code-review.md`
- Modify: `docs/superpowers/specs/2026-07-18-p1-release-gate-design.md`
- Create: `tests/board-image-cleanup-job.test.ts`

**Interfaces:**
- Consumes: Task 1 claim/finalize RPC
- Produces: `npm run cleanup:board-images`; 최대 20개·30초 신규 batch 시작 제한·최대 5 batch

- [x] **Step 1: cleanup RED 테스트 작성**

```text
한 RPC batch limit 20, 최대 5 batch, 30초 후 신규 batch 0
pending 24시간 전 객체는 claim하지 않음
legacy_retained는 claim하지 않음
Storage 성공/404는 finalize(true), 반환 error/throw는 finalize(false)
token/key/error 원문을 로그에 기록하지 않음
기존 daily maintenance 실패와 독립 job
workflow timeout-minutes가 있으며 무료 플랜에서 동시 cleanup 1개
```

- [x] **Step 2: RED 확인**

Run: `npx vitest run tests/board-image-cleanup-job.test.ts`

- [x] **Step 3: bounded cleanup과 workflow 구현**

별도 Vercel Cron을 만들지 않는다. 기존 GitHub Actions에 `needs` 없는 독립 job을 추가하고 repository secrets의 기존 Supabase server credentials만 사용한다. 운영 삭제는 migration 배포와 Preview 검증 후에만 workflow를 활성화하며 그 전에는 job 조건을 false로 유지한다.

- [x] **Step 4: 보고서와 계획 상태 갱신**

P1 Storage 항목을 해결됨으로 표시하되 다음 배포 gate를 명시한다.

```text
신규 migration 선적용
board-images-v2 bucket/policy 확인
Preview member signed upload·작성·수정·취소 QA
기존 images 7개 보존 확인
cleanup workflow 수동 dry-run 후 활성화
```

- [ ] **Step 5: 전체 검증**

Run:

```bash
npm run verify:analysis
npm run verify:admin
npx vitest run tests/board-*.test.ts
npx vitest run
npm test -- --runInBand
npm run verify:core
git diff --check
rg -n 'storage\.from\("images"\)\.remove|storage\.from\("images"\)\.upload' app components lib
```

임시 PostgreSQL에서 `npm run verify:board-image-db`를 실행하고 서버를 종료한다. 운영 migration·Storage 삭제는 0건이어야 한다.

- [ ] **Step 6: 최종 보안 리뷰와 커밋**

`gpt-5.6-sol high` 리뷰에서 Critical·Important 0건이어야 한다. Minor는 보고서에 배포 gate와 함께 기록한다.

Commit: `docs: 게시판 이미지 Storage P1 검증 결과 반영`
