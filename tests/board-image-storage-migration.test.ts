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
});
