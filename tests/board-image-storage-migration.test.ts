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

  it("만료 pending과 deleting lease를 bounded claim으로 회수한다", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("now() + interval '24 hours'");
    expect(sql).toContain("object_row.status = 'delete_pending' AND object_row.delete_after <= p_now");
    expect(sql).toContain("object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now");
    expect(sql).toContain("object_row.status = 'pending' AND object_row.expires_at <= p_now");
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
    expect(script).toContain("reserve-complete");
    expect(script).toContain("mime-size-rejection");
    expect(script).toContain("revision-conflict-immutable");
    expect(script).toContain("multi-ref-detach");
    expect(script).toContain("duplicate-claim");
    expect(script).toContain("expired-lease-reclaim");
    expect(script).toContain("finalize-retry");
    expect(script).toContain("anon-table-denied");
    expect(script).toContain("authenticated-table-denied");
    expect(script).toContain("attach-vs-detach");
    expect(script).toContain("concurrent-worker-claim");
    expect(script).toContain("legacy-retained-detach");
    expect(script).toContain("fixture-cleanup");
  });

  it("검증 fixture는 성공 revision과 실제 경쟁 결과를 보존하고 finally에서 정리한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify_board_image_storage_migration.ts"), "utf8");

    expect(script).toContain("let currentRevision");
    expect(script).toContain("other-owner-pending");
    expect(script).toContain("legacy-backfill");
    expect(script).toContain("finally");
    expect(script).toContain("workerOneIds");
    expect(script).toContain("workerTwoIds");
    expect(script).toContain("attach-vs-detach-result");
  });
});
