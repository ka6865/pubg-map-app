# Supabase 운영 migration 정합성 점검

- 점검일: 2026-07-22
- 대상: 연결된 BGMS 운영 Supabase
- 실행 범위: migration 이력·시스템 카탈로그·Storage 읽기 전용 조회
- 운영 변경: 없음

## 1. 결론

원격 migration 이력과 로컬 파일의 timestamp가 2026-06-14 이후 여러 지점에서 달랐다. 원격 이력의 migration 이름과 SQL을 `supabase migration fetch --linked`로 가져와 비교한 결과, 7개는 로컬의 동일 이름 migration이 다른 timestamp로 존재했다. 로컬의 보안 보강 SQL을 유지하면서 파일 timestamp를 원격 이력과 동일하게 정렬했다.

원격에만 존재하던 `20260708081848_create_user_knowledge_memory.sql`은 원격 migration history의 SQL을 그대로 복원했다. 이로써 원격에만 존재하는 migration version은 없어졌다.

현재 원격 이력에 없는 과거 로컬 migration은 다음 2개다.

- `20260614000000_board_draft_and_shadow_support.sql`
- `20260618023000_add_crate_purchase_methods_and_crafting.sql`

두 migration의 핵심 스키마·정책·시드는 운영에 이미 존재한다. 따라서 실제 SQL을 재실행하는 `--include-all`보다, 최종 승인 후 두 version만 `migration repair --status applied`로 이력을 보정하는 방식이 적합하다. 이 점검에서 repair는 실행하지 않았다.

## 2. timestamp 정렬 내역

| 원격 version | 기존 로컬 version | migration 이름 | 처리 |
|---|---|---|---|
| `20260615074451` | `20260615164200` | `auth_user_cascade_deletion` | 로컬 보강 SQL을 원격 version으로 이동 |
| `20260616120024` | `20260617000000` | `add_guest_and_moderation_tables` | `hidden` enum 보강을 유지하고 원격 version으로 이동 |
| `20260618010257` | `20260618005423` | `crate_asset_mapping` | grant·`search_path` 보강을 유지하고 원격 version으로 이동 |
| `20260618010634` | `20260618011000` | `fix_crate_asset_mapping_search_path` | 원격 version으로 이동 |
| `20260618015905` | `20260618020000` | `normalize_crate_relations` | 원격 version으로 이동 |
| `20260618020409` | `20260618021000` | `add_rarity_to_assets` | 원격 version으로 이동 |
| `20260621154245` | `20260622000000` | `create_system_settings_table` | 원격 version으로 이동 |
| `20260708081848` | 없음 | `create_user_knowledge_memory` | 원격 SQL 복원 |

## 3. 이력이 없는 과거 migration의 실제 스키마 검증

### `20260614000000_board_draft_and_shadow_support`

운영 시스템 카탈로그에서 다음을 확인했다.

- `posts.status` 존재, `post_status` enum 사용
- `posts.parent_id` 존재
- enum 값 `draft`, `published`, `hidden` 존재
- `unique_post_published_title` 조건부 unique index 존재
- `posts` RLS 활성
- 공개글 조회, 소유자·관리자 조회·수정·삭제 정책 존재

### `20260618023000_add_crate_purchase_methods_and_crafting`

운영 시스템 카탈로그와 집계에서 다음을 확인했다.

- `crate_templates` 가격·티켓·보너스 컬럼 8개 존재
- `craftable_items` 테이블 존재
- `craftable_items` RLS 활성
- 공개 조회·관리자 관리 정책 존재
- `2026_blackmarket` 시드 12건 존재

## 4. 현재 운영에 없는 신규 migration

timestamp 정렬 후 다음 5개가 신규 적용 후보다.

1. `20260718122322_board_turnstile_write_boundary.sql`
2. `20260718152309_telemetry_map_cache_entries.sql`
3. `20260718203104_board_image_storage_ownership.sql`
4. `20260719000000_create_published_post_comment.sql`
5. `20260721120000_add_imagination_and_glasya.sql`

이미지 migration만 단독 `db push`할 수 있는 상태가 아니다. 프로젝트의 timestamp 순서상 위 5개가 함께 적용되므로 실제 운영 반영 전 다섯 migration 전체를 배포 단위로 검증해야 한다.

## 5. Storage 기준점

- `.env.local`의 Supabase URL과 CLI linked project가 일치했다.
- `images` 버킷은 존재한다.
- `images` 버킷 root 객체는 7개다.
- `board-images-v2` 버킷은 없다.
- `20260718203104` migration은 원격 이력에 없다.

구현·검증 후 동일한 읽기 전용 조회를 다시 실행했다. `images` 객체 7개, `board-images-v2` 미생성, `20260718203104` 원격 미적용 상태가 모두 유지됐다.

## 6. 금지 작업

- 스키마 확인 없이 원격 전용 migration을 `reverted` 처리
- `supabase db push --include-all`로 이미 존재하는 과거 schema 재실행
- SQL Editor로 이미지 migration만 수동 적용
- cleanup dry-run 없이 `claim_board_image_deletions` 호출
- 기존 `images` 버킷 객체 삭제·이동

## 7. cleanup dry-run 구현 결과

다음 내용을 구현했다.

- `inspect_board_image_deletion_candidates(p_now)` 읽기 전용 RPC
- `service_role`만 RPC 실행 가능
- cleanup CLI의 `--dry-run` 모드
- dry-run에서 claim, Storage 삭제, finalize를 호출하지 않는 테스트
- 개별 image ID·storage key·token을 로그에 남기지 않고 status별 건수만 출력
- 알 수 없는 status, 음수·소수 count, 중복 status 응답을 실패 처리

정적 migration 계약, cleanup 단위 테스, TypeScript, ESLint은 통과했다. 운영과 분리된 PostgreSQL 17 일회용 DB에 Supabase auth baseline과 이미지 migration의 최소 prerequisite를 구성한 뒤 migration SQL을 실제 적용했다. 이후 소유권·RLS·RPC ACL, 예약 quota, MIME/크기 검증, 게시글 참조, 동시 cleanup claim, lease 복구, legacy backfill, cleanup audit 비변경성 시나리오 전체를 2회 연속 실행해 통과했다.

다만 빈 로컬 DB의 **전체 migration 재생**은 기존 baseline 결함으로 중단됐다. `20260526022000_auth_profiles_trigger.sql`이 migration 이력에 생성 SQL이 없는 `public.profiles`를 사용하므로 해당 지점에서 실패한다. 실패 지점은 이번에 추가한 이미지 migration보다 앞선다.

이 baseline 결함은 운영 DB를 변경하지 않았고, 임시 테이블을 추가해 통과처리하지도 않았다. 별도 migration baseline 복구 작업으로 추적해야 한다.

최종 검증 결과는 다음과 같다.

- board image 관련 Vitest: 8 files, 113 tests 통과
- 전체 Vitest: 45 files, 603 tests 통과, 1 file·6 tests skip
- Jest: 1 suite, 2 tests 통과
- `eslint && tsc --noEmit`: 종료 코드 0; 기존 경고 58개, 오류 0개
- PostgreSQL 17 실제 fixture: 전체 시나리오 2회 연속 통과

## 8. 다음 게이트

1. migration baseline에서 `profiles`·필수 초기 schema 생성 이력을 복구하고 빈 DB 전체 재생 검증
2. migration fixture에 5개 신규 migration 순서 통합 검증
3. `20260614000000`, `20260618023000` 두 이력을 `applied`로 보정하는 실행 계획 보고
4. 보정 후 `supabase db push --linked --dry-run`에 5개 신규 migration만 나오는지 확인
5. 실제 운영 repair·migration 적용은 별도 승인 후 진행

## 9. CLI 제약

Supabase CLI 2.105.0의 `db dump` reachability는 정상이었지만 schema-only 출력 파일이 빈 파일로 생성됐다. 동일 명령을 반복하지 않고, CLI 2.105.0에 포함된 `supabase db query --linked`의 Management API 경로로 시스템 카탈로그를 읽기 전용 조회했다. 현재 최신 CLI 안내 버전은 2.109.1이지만, 이 작업에서 CLI 업그레이드는 수행하지 않았다.
