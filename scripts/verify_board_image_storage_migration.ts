import { spawn } from "node:child_process";

const databaseUrl = process.env.BOARD_IMAGE_STORAGE_TEST_DATABASE_URL?.trim();
const ownerId = process.env.BOARD_IMAGE_STORAGE_TEST_OWNER_ID?.trim();

if (!databaseUrl) throw new Error("BOARD_IMAGE_STORAGE_TEST_DATABASE_URL-missing");
if (!ownerId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
  throw new Error("BOARD_IMAGE_STORAGE_TEST_OWNER_ID-missing-or-invalid");
}

const connectionUrl = databaseUrl;
const parsedUrl = new URL(connectionUrl);
if (!["127.0.0.1", "::1", "localhost"].includes(parsedUrl.hostname)) {
  throw new Error("unsafe-board-image-storage-test-database-url");
}

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
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `psql-exit-${code}`));
    });
  });
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected=${expected}, actual=${actual}`);
}

async function scalar(sql: string, label: string): Promise<string> {
  const value = (await executeSql(sql)).split(/\r?\n/).filter(Boolean).at(-1) ?? "";
  if (!value) throw new Error(`${label}: empty-result`);
  return value;
}

async function main(): Promise<void> {
  const prefix = "verify-board-image-storage-";
  await executeSql(`
    SET ROLE service_role;
    DELETE FROM public.board_post_image_refs AS ref_row
    USING public.board_image_objects AS image_row
    WHERE ref_row.image_id = image_row.id AND image_row.storage_key LIKE '${prefix}%';
    DELETE FROM public.board_image_objects AS image_row WHERE image_row.storage_key LIKE '${prefix}%';
  `);

  assertEqual(await scalar(`
    SELECT count(*) FROM pg_class AS class_row JOIN pg_namespace AS namespace_row ON namespace_row.oid = class_row.relnamespace
    WHERE namespace_row.nspname = 'public' AND class_row.relname IN ('board_image_objects', 'board_post_image_refs')
      AND class_row.relrowsecurity
  `, "rls-enabled"), "2", "rls-enabled");
  assertEqual(await scalar(`
    SELECT count(*) FROM information_schema.routine_privileges AS privilege_row
    WHERE privilege_row.routine_schema = 'public' AND privilege_row.grantee IN ('anon', 'authenticated')
      AND privilege_row.routine_name IN ('reserve_board_image_upload', 'complete_board_image_upload', 'write_board_post_with_images', 'claim_board_image_deletions', 'finalize_board_image_deletion')
  `, "public-rpc-execute"), "0", "public-rpc-execute");

  const reserveId = await scalar(`
    SET ROLE service_role;
    SELECT reservation.image_id FROM public.reserve_board_image_upload('${ownerId}'::uuid, 'image/png', 100) AS reservation
  `, "reserve-complete");
  await executeSql(`
    SET ROLE service_role;
    UPDATE public.board_image_objects AS image_row
    SET storage_key = '${prefix}ready.png' WHERE image_row.id = '${reserveId}'::uuid;
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('board-images-v2', '${prefix}ready.png', '${ownerId}'::uuid, '{"mimetype":"image/png","size":100}'::jsonb)
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
  `);
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT public.complete_board_image_upload('${reserveId}'::uuid, '${ownerId}'::uuid)::text
  `, "reserve-complete"), "true", "reserve-complete");
  assertEqual(await scalar(`
    SELECT image_row.status FROM public.board_image_objects AS image_row WHERE image_row.id = '${reserveId}'::uuid
  `, "reserve-complete-status"), "ready", "reserve-complete-status");

  const invalidId = await scalar(`
    SET ROLE service_role;
    SELECT reservation.image_id FROM public.reserve_board_image_upload('${ownerId}'::uuid, 'image/png', 100) AS reservation
  `, "mime-size-rejection");
  await executeSql(`
    SET ROLE service_role;
    UPDATE public.board_image_objects AS image_row
    SET storage_key = '${prefix}invalid.png' WHERE image_row.id = '${invalidId}'::uuid;
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('board-images-v2', '${prefix}invalid.png', '${ownerId}'::uuid, '{"mimetype":"image/jpeg","size":101}'::jsonb)
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
  `);
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT public.complete_board_image_upload('${invalidId}'::uuid, '${ownerId}'::uuid)::text
  `, "mime-size-rejection"), "false", "mime-size-rejection");

  const postState = await scalar(`
    SET ROLE service_role;
    SELECT write_result.post_id::text || ':' || write_result.revision::text
    FROM public.write_board_post_with_images(NULL, '${ownerId}'::uuid, 0, '${prefix} post', 'content', 'free', NULL,
      false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY['${reserveId}'::uuid], '${reserveId}'::uuid) AS write_result
  `, "multi-ref-detach");
  const [postId, revision] = postState.split(":");
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT write_result.result_code
    FROM public.write_board_post_with_images('${postId}'::bigint, '${ownerId}'::uuid, ${Number(revision) + 1}, 'changed', 'changed', 'free', NULL,
      false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY['${reserveId}'::uuid], '${reserveId}'::uuid) AS write_result
  `, "revision-conflict-immutable"), "revision_conflict", "revision-conflict-immutable");
  assertEqual(await scalar(`
    SELECT post_row.revision::text FROM public.posts AS post_row WHERE post_row.id = '${postId}'::bigint
  `, "revision-conflict-immutable"), revision, "revision-conflict-immutable");
  await executeSql(`
    SET ROLE service_role;
    SELECT * FROM public.write_board_post_with_images('${postId}'::bigint, '${ownerId}'::uuid, ${revision}, '${prefix} post', 'content', 'free', NULL,
      false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY[]::uuid[], '${reserveId}'::uuid);
  `);
  assertEqual(await scalar(`
    SELECT count(*)::text FROM public.board_image_objects AS image_row
    WHERE image_row.id = '${reserveId}'::uuid AND image_row.status = 'ready'
  `, "multi-ref-detach"), "1", "multi-ref-detach");

  await executeSql(`
    SET ROLE service_role;
    INSERT INTO public.board_image_objects (bucket_id, storage_key, owner_user_id, status, delete_after)
    VALUES ('board-images-v2', '${prefix}claim.png', '${ownerId}'::uuid, 'delete_pending', now() - interval '1 minute');
  `);
  const claimOne = await scalar(`
    SET ROLE service_role;
    SELECT claim_result.image_id::text FROM public.claim_board_image_deletions(20, now(), 300) AS claim_result
    WHERE claim_result.storage_key = '${prefix}claim.png'
  `, "duplicate-claim");
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT count(*) FROM public.claim_board_image_deletions(20, now(), 300) AS claim_result
    WHERE claim_result.image_id = '${claimOne}'::uuid
  `, "duplicate-claim"), "0", "duplicate-claim");
  await executeSql(`
    SET ROLE service_role;
    UPDATE public.board_image_objects AS image_row
    SET delete_lease_until = now() - interval '1 second' WHERE image_row.id = '${claimOne}'::uuid;
  `);
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT count(*)::text FROM public.claim_board_image_deletions(20, now(), 300) AS claim_result
    WHERE claim_result.image_id = '${claimOne}'::uuid
  `, "expired-lease-reclaim"), "1", "expired-lease-reclaim");
  const leaseToken = await scalar(`
    SELECT image_row.delete_lease_token::text FROM public.board_image_objects AS image_row WHERE image_row.id = '${claimOne}'::uuid
  `, "finalize-retry");
  assertEqual(await scalar(`
    SET ROLE service_role;
    SELECT public.finalize_board_image_deletion('${claimOne}'::uuid, '${leaseToken}'::uuid, false)::text
  `, "finalize-retry"), "true", "finalize-retry");
  assertEqual(await scalar(`
    SELECT (image_row.status = 'delete_pending' AND image_row.delete_after >= now() + interval '23 hours')::text
    FROM public.board_image_objects AS image_row WHERE image_row.id = '${claimOne}'::uuid
  `, "finalize-retry"), "true", "finalize-retry");

  process.stdout.write("board-image-storage-migration: fixture verification passed\n");
}

void main();
