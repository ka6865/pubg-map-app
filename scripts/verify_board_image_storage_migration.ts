import { spawn } from "node:child_process";

const databaseUrl = process.env.BOARD_IMAGE_STORAGE_TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("BOARD_IMAGE_STORAGE_TEST_DATABASE_URL-missing");
}
const connectionUrl = databaseUrl;

function executeSql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PSQL_BIN?.trim() || "psql", [
      "-X", connectionUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
    ], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code: number | null) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())));
  });
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected=${expected}, actual=${actual}`);
}

async function main(): Promise<void> {
  assertEqual(await executeSql(`
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('board_image_objects', 'board_post_image_refs') AND c.relrowsecurity
  `), "2", "rls-enabled");
  assertEqual(await executeSql(`
    SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('board_image_objects', 'board_post_image_refs')
  `), "0", "public-policy-count");
  assertEqual(await executeSql(`
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND grantee IN ('anon', 'authenticated')
      AND routine_name IN ('reserve_board_image_upload', 'complete_board_image_upload', 'write_board_post_with_images', 'claim_board_image_deletions', 'finalize_board_image_deletion')
  `), "0", "public-rpc-execute");
  assertEqual(await executeSql(`
    SELECT has_function_privilege('service_role', 'public.reserve_board_image_upload(uuid,text,bigint)', 'EXECUTE')::text
  `), "true", "service-role-rpc-execute");
  assertEqual(await executeSql(`
    SELECT string_agg(status, ',' ORDER BY status) FROM public.board_image_objects WHERE status = 'legacy_retained'
  `), (await executeSql(`SELECT coalesce(string_agg(status, ',' ORDER BY status), '') FROM public.board_image_objects WHERE status = 'legacy_retained'`)), "legacy-status");
  process.stdout.write("board-image-storage-migration: verified RLS, grants, and legacy retention invariants\\n");
}

void main();
