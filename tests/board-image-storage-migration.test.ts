import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((name) => name.endsWith("_board_image_storage_ownership.sql"))
  .map((name) => `supabase/migrations/${name}`);

function readMigrationSql(): string {
  expect(migrationPaths).toHaveLength(1);

  return readFileSync(resolve(process.cwd(), migrationPaths[0]), "utf8");
}

describe("게시판 이미지 Storage 소유권 마이그레이션", () => {
  it("관리형 이미지와 게시글 참조 테이블을 만든다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.board_image_objects");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.board_post_image_refs");
  });

  it("새 공개 테이블의 RLS를 활성화한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("ALTER TABLE public.board_image_objects ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.board_post_image_refs ENABLE ROW LEVEL SECURITY");
  });

  it("내부 RPC의 실행 권한을 service_role로 한정한다", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/SECURITY INVOKER/g);
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
    expect(sql).toContain("TO service_role");
    expect(sql).not.toMatch(/GRANT .* TO (anon|authenticated)/);
  });

  it("reserve는 클라이언트 신고 크기를 신뢰하지 않고 최대 이미지 크기로만 쿼터를 예약한다", () => {
    const sql = readMigrationSql();
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(sql).toContain("p_max_bytes IS DISTINCT FROM 1572864");
    expect(sql).toContain("v_active_bytes + 1572864 > 52428800");
    expect(sql).toContain("p_expected_mime_type, 1572864, now() + interval '24 hours'");
    expect(script).toContain("reservation-client-byte-size-rejected");
    expect(script).toContain("reservation-full-max-bytes");
    expect(script).toContain("reservation-worst-case-bytes");
  });

  it("레거시와 삭제 lease 상태를 보존한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("legacy_retained");
    expect(sql).toContain("delete_lease_until");
  });

  it("기존 board Storage 정책만 정확히 교체한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated Users Insert" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Delete Policy" ON storage.objects');
    expect(sql).toContain("board-images-v2");
  });

  it("OUT 변수와 충돌하지 않도록 RPC SQL 컬럼을 별칭으로 한정한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("FROM public.posts AS post_row WHERE post_row.id = p_post_id FOR UPDATE");
    expect(sql).toContain("UPDATE public.posts AS post_row");
    expect(sql).toContain("RETURNING post_row.revision INTO v_post.revision");
    expect(sql).not.toContain("WHERE id = p_post_id FOR UPDATE");
    expect(sql).not.toContain("RETURNING revision INTO v_post.revision");
  });

  it("attach와 detach가 같은 이미지 행을 고정 순서로 잠근다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("locked_image_ids AS");
    expect(sql).toContain("ORDER BY requested_row.requested_image_id");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("invalid_board_image_reference");
    expect(sql).toContain("image_row.status = 'ready'");
  });

  it("만료 pending·미참조 ready와 deleting lease를 bounded claim으로 회수한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("now() + interval '24 hours'");
    expect(sql).toContain("object_row.status = 'delete_pending' AND object_row.delete_after <= p_now");
    expect(sql).toContain("object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now");
    expect(sql).toContain("object_row.status IN ('pending', 'ready') AND object_row.expires_at <= p_now");
    expect(sql).toContain("ORDER BY object_row.id");
    expect(sql).toContain("LIMIT LEAST(p_limit, 20)");
  });

  it("참조가 생긴 이미지는 후보와 상태 전이 단계 모두에서 claim하지 않는다", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/WHERE[\s\S]*object_row\.status = 'delete_pending'[\s\S]*NOT EXISTS \([\s\S]*ref_row\.image_id = object_row\.id/g);
    expect(sql).toMatch(/FROM candidates AS candidate_row[\s\S]*AND NOT EXISTS \([\s\S]*ref_row\.image_id = object_row\.id/g);
  });

  it("실제 images 객체와 정규 Supabase URL만 legacy ref로 backfill한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("FROM storage.objects AS storage_object");
    expect(sql).toContain("storage_object.bucket_id = 'images'");
    expect(sql).toContain("https://%.supabase.co/storage/v1/object/public/images/%");
    expect(sql).toContain("position('%' in legacy_url.image_url) = 0");
    expect(sql).toContain("[.]supabase[.]co");
    expect(sql).not.toContain("\\\\.supabase\\\\.co");
    expect(sql).not.toContain("owner_user_id = storage_object.owner");
  });

  it("참조와 삭제 claim 조회를 위한 인덱스를 만든다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE INDEX IF NOT EXISTS board_post_image_refs_image_id_idx");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS board_image_objects_claim_idx");
  });

  it("격리 DB 검증 스크립트가 운영 URL을 거부하고 핵심 행위를 검사한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("unsafe-board-image-storage-test-database-url");
    expect(script).toContain("reserve-ready");
    expect(script).toContain("last-ref-delete-pending");
    expect(script).toContain("anon-table-denied");
    expect(script).toContain("authenticated-table-denied");
    expect(script).toContain("attach-detach-result");
    expect(script).toContain("concurrent-worker-claim");
    expect(script).toContain("legacy-canonical-ref-count");
  });

  it("검증 fixture는 성공 revision과 실제 경쟁 결과를 보존하고 finally에서 정리한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("const currentRevision");
    expect(script).toContain("other-owner-complete");
    expect(script).toContain("legacy-canonical-ref-count");
    expect(script).toContain("finally");
    expect(script).toContain("workerOneIds");
    expect(script).toContain("workerTwoIds");
    expect(script).toContain("attach-detach-result");
  });

  it("검증 script는 시나리오별 fresh fixture를 소유하고 재사용하지 않는다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("verifyAclAndOwnership");
    expect(script).toContain("verifyUploadValidationAndReferences");
    expect(script).toContain("verifyRevisionAndAttachDetachRace");
    expect(script).toContain("verifyClaimsAndRecovery");
    expect(script).toContain("verifyLegacyBackfill");
    expect(script).toContain("createFixture");
    expect(script).toContain("await fixture.cleanup();");
    expect(script).toContain("runAllScenarios");
    expect(script).toContain("runId");
    expect(script).not.toContain('const prefix = "verify-board-image-storage-"');
  });

  it("UUID 배열은 비어 있어도 명시적으로 uuid 배열로 캐스팅한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain('return "ARRAY[]::uuid[]"');
    expect(script).toContain('return `ARRAY[${ids.map((id) => `${quote(id)}::uuid`).join(",")}]::uuid[]`');
    expect(script).not.toMatch(/ARRAY\[\$\{imageIds\.map/);
  });

  it("attach와 detach 경쟁은 allSettled 뒤 정확히 허용한 사후 상태만 인정한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("Promise.allSettled");
    expect(script).toContain("attach-detach-unexpected-settlement");
    expect(script).toContain("attach-detach-invalid-post-a-ref-count");
    expect(script).toContain("attach-detach-invalid-post-b-ref-count");
    expect(script).toContain("attach-detach-invalid-status");
    expect(script).not.toContain("await Promise.all([\n      sql(`SET ROLE service_role; SELECT * FROM public.write_board_post_with_images");
  });

  it("fixture cleanup은 추적한 ID와 runId key를 삭제하고 잔존 행을 검증한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("image_row.id = ANY(${uuidArray(imageIds)})");
    expect(script).toContain("storage_object.name = ANY(${textArray(storageKeys)})");
    expect(script).toContain("cleanup-post-residue");
    expect(script).toContain("cleanup-image-residue");
    expect(script).toContain("cleanup-storage-residue");
    expect(script).toContain("await fixture.cleanup();\n  try {");
  });

  it("legacy fixture는 정규·percent·외부·lookalike URL을 함께 검증한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("legacy-canonical-ref-count");
    expect(script).toContain("legacy-percent-encoded-ref-count");
    expect(script).toContain("legacy-external-ref-count");
    expect(script).toContain("legacy-lookalike-ref-count");
    expect(script).toContain("%2D");
    expect(script).toContain("not-supabase.co");
  });

  it("독립 검증 시나리오가 MIME·size·revision·참조 보존·lease 복구를 모두 포함한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    for (const scenario of [
      "mime-violation", "size-violation", "revision-conflict", "content-thumbnail-preserved",
      "two-posts-preserved", "last-ref-delete-pending", "legacy-retained-preserved",
      "expired-deleting-reclaim", "expired-pending-claim", "finalize-false-recovery",
    ]) expect(script).toContain(scenario);
  });

  it("RLS와 모든 public 역할의 RPC 실행 거부를 실제 검증한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("board-image-objects-rls");
    expect(script).toContain("board-post-image-refs-rls");
    expect(script).toContain("public-rpc-denied");
    expect(script).toContain("anon-rpc-denied");
    expect(script).toContain("authenticated-rpc-denied");
    expect(script).toContain("service-role-execute");
  });

  it("legacy retained 참조는 직접 삭제하지 않고 게시글 RPC detach로 제거한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");
    const legacyScenario = script.slice(script.indexOf("legacy-retained-create"), script.indexOf("legacy-retained-claim-count") + "legacy-retained-claim-count".length);

    expect(legacyScenario).toContain('updatePost(legacyPost.postId, legacyPost.revision, [], null, "legacy-retained-detach")');
    expect(legacyScenario).toContain("legacy-retained-ref-count");
    expect(legacyScenario).toContain("legacy-retained-claim-count");
    expect(legacyScenario).not.toContain("DELETE FROM public.board_post_image_refs");
  });

  it("PUBLIC RPC 권한은 pseudo-role 조회 대신 ACL grantee 0으로 검사한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner)))");
    expect(script).toContain("acl_row.grantee = 0");
    expect(script).toContain("to_regprocedure(${quote(signature)})");
    expect(script).not.toContain('has_function_privilege(${quote("PUBLIC")}');
    expect(script).not.toContain('["PUBLIC", "public-rpc-denied"]');
  });

  it("psql은 quiet tuples-only 모드로 command tag 오염 없이 scalar를 반환한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain('"-qAt"');
    expect(script).not.toContain('"-At"');
    expect(script).not.toMatch(/filter\([^)]*INSERT|filter\([^)]*UPDATE/);
  });

  it("owner 범위 삭제 claim RPC는 입력·소유권·상태·참조·lock 계약을 고정한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_board_image_deletions_for_owner(");
    expect(sql).toContain("p_owner_user_id uuid, p_image_ids uuid[], p_now timestamptz, p_lease_seconds integer");
    expect(sql).toContain("RETURNS TABLE(image_id uuid, bucket_id text, storage_key text, lease_token uuid)");
    expect(sql).toContain("cardinality(p_image_ids) < 1 OR cardinality(p_image_ids) > 20");
    expect(sql).toContain("array_position(p_image_ids, NULL) IS NOT NULL");
    expect(sql).toContain("object_row.owner_user_id = p_owner_user_id");
    expect(sql).toContain("requested_ids AS");
    expect(sql).toContain("SELECT DISTINCT requested_item.requested_id");
    expect(sql).toContain("object_row.status IN ('pending', 'ready', 'delete_pending')");
    expect(sql).toContain("object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now");
    expect(sql).toContain("ORDER BY object_row.id");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toMatch(/claim_board_image_deletions_for_owner[\s\S]*NOT EXISTS \([\s\S]*ref_row\.image_id = object_row\.id[\s\S]*UPDATE public\.board_image_objects AS object_row[\s\S]*NOT EXISTS \(/);
  });

  it("owner 범위 삭제 claim RPC 권한과 실제 검증 시나리오를 포함한다", () => {
    const sql = readMigrationSql();
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_board_image_deletions_for_owner(uuid, uuid[], timestamptz, integer) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_board_image_deletions_for_owner(uuid, uuid[], timestamptz, integer) TO service_role");
    expect(script).toContain("public.claim_board_image_deletions_for_owner(uuid,uuid[],timestamptz,integer)");
    expect(script).toContain("verifyOwnerScopedReleaseClaims");
    for (const label of ["owner-release-own-ready", "owner-release-own-pending", "owner-release-other-owner", "owner-release-referenced", "owner-release-unrequested", "owner-release-active-deleting", "owner-release-expired-deleting", "owner-release-duplicate-once", "owner-release-empty-rejected", "owner-release-null-rejected", "owner-release-21-rejected"]) {
      expect(script).toContain(label);
    }
  });

  it("owner release verifier는 실제 owner2 UUID row로 소유권 격리를 검증한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");
    const scenario = script.slice(script.indexOf("async function verifyOwnerScopedReleaseClaims"), script.indexOf("async function verifyClaimsAndRecovery"));

    expect(scenario).toContain('const otherOwnerId = "00000000-0000-0000-0000-000000000002"');
    expect(scenario).toContain("ensureAuthUser");
    expect(scenario).toContain("owner-release-other-owner-excluded");
    expect(scenario).toContain("owner-release-other-owner-own-claim");
    expect(scenario).not.toContain('createRegistry("other-owner", "NULL"');
  });

  it("owner release verifier는 owner1 delete_pending을 한 번 claim하고 deleting 전이를 확인한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");
    const scenario = script.slice(script.indexOf("async function verifyOwnerScopedReleaseClaims"), script.indexOf("async function verifyClaimsAndRecovery"));

    expect(scenario).toContain('createRegistry("delete-pending"');
    expect(scenario).toContain("owner-release-delete-pending-once");
    expect(scenario).toContain("owner-release-delete-pending-status");
  });
});
