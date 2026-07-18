import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseUrl = process.env.BOARD_IMAGE_STORAGE_TEST_DATABASE_URL?.trim();
const ownerId = process.env.BOARD_IMAGE_STORAGE_TEST_OWNER_ID?.trim();
if (!databaseUrl) throw new Error("BOARD_IMAGE_STORAGE_TEST_DATABASE_URL-missing");
if (!ownerId?.match(/^[0-9a-f-]{36}$/i)) throw new Error("BOARD_IMAGE_STORAGE_TEST_OWNER_ID-missing-or-invalid");
if (!["127.0.0.1", "::1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("unsafe-board-image-storage-test-database-url");
}
const connectionUrl = databaseUrl;

function sql(statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.PSQL_BIN?.trim() || "psql", ["-X", connectionUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code: number | null) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr.trim() || `psql-exit-${code}`)));
  });
}

async function scalar(statement: string, label: string): Promise<string> {
  const value = (await sql(statement)).split(/\r?\n/).filter(Boolean).at(-1) ?? "";
  if (!value) throw new Error(`${label}: empty-result`);
  return value;
}

function equal(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected=${expected}, actual=${actual}`);
}

async function rejected(statement: string, label: string): Promise<void> {
  try { await sql(statement); } catch { return; }
  throw new Error(`${label}: expected-rejection`);
}

type Fixture = { runId: string; postIds: number[]; imageIds: string[]; storageKeys: string[]; cleanup: () => Promise<void> };

function createFixture(name: string): Fixture {
  const runId = `verify-board-image-${name}-${crypto.randomUUID()}`;
  const postIds: number[] = [];
  const imageIds: string[] = [];
  const storageKeys: string[] = [];
  return {
    runId, postIds, imageIds, storageKeys,
    cleanup: async () => {
      await sql(`SET ROLE service_role;
        DELETE FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ANY(ARRAY[${postIds.join(",") || "NULL"}]::bigint[]);
        DELETE FROM public.board_post_image_refs AS ref_row USING public.board_image_objects AS image_row WHERE ref_row.image_id = image_row.id AND image_row.storage_key LIKE '${runId}%';
        DELETE FROM public.board_image_objects AS image_row WHERE image_row.storage_key LIKE '${runId}%';
        DELETE FROM public.posts AS post_row WHERE post_row.id = ANY(ARRAY[${postIds.join(",") || "NULL"}]::bigint[]);
        DELETE FROM storage.objects AS storage_object WHERE storage_object.name LIKE '${runId}%';`);
    },
  };
}

async function reserveReady(fixture: Fixture, suffix: string): Promise<string> {
  const imageId = await scalar(`SET ROLE service_role; SELECT result.image_id FROM public.reserve_board_image_upload('${ownerId}'::uuid, 'image/png', 100) AS result`, "reserve-ready");
  const key = `${fixture.runId}-${suffix}.png`;
  fixture.imageIds.push(imageId);
  fixture.storageKeys.push(key);
  await sql(`SET ROLE service_role;
    UPDATE public.board_image_objects AS image_row SET storage_key = '${key}' WHERE image_row.id = '${imageId}'::uuid;
    INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('board-images-v2', '${key}', '${ownerId}'::uuid, '{"mimetype":"image/png","size":100}'::jsonb);
    SELECT public.complete_board_image_upload('${imageId}'::uuid, '${ownerId}'::uuid);`);
  return imageId;
}

async function writePost(fixture: Fixture, imageIds: string[], revision = 0): Promise<{ postId: number; revision: number }> {
  const result = await scalar(`SET ROLE service_role;
    SELECT result.post_id::text || ':' || result.revision::text FROM public.write_board_post_with_images(NULL, '${ownerId}'::uuid, ${revision}, '${fixture.runId}-${crypto.randomUUID()}', 'content', 'free', NULL, false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY[${imageIds.map((id) => `'${id}'::uuid`).join(",")}], NULL) AS result`, "write-post");
  const [postId, currentRevision] = result.split(":").map(Number);
  fixture.postIds.push(postId);
  return { postId, revision: currentRevision };
}

async function verifyAclAndOwnership(): Promise<void> {
  const fixture = createFixture("acl");
  try {
    equal(await scalar("SELECT count(*) FROM pg_policies AS p WHERE p.schemaname = 'public' AND p.tablename IN ('board_image_objects','board_post_image_refs')", "public-policy-count"), "0", "public-policy-count");
    equal(await scalar("SELECT has_function_privilege('service_role', 'public.reserve_board_image_upload(uuid,text,bigint)', 'EXECUTE')::text", "service-role-execute"), "true", "service-role-execute");
    await rejected("SET ROLE anon; SELECT * FROM public.board_image_objects", "anon-table-denied");
    await rejected("SET ROLE authenticated; SELECT * FROM public.board_post_image_refs", "authenticated-table-denied");
    const pendingId = await scalar(`SET ROLE service_role; SELECT result.image_id FROM public.reserve_board_image_upload('${ownerId}'::uuid, 'image/png', 100) AS result`, "other-owner-pending");
    fixture.imageIds.push(pendingId);
    equal(await scalar(`SET ROLE service_role; SELECT public.complete_board_image_upload('${pendingId}'::uuid, '00000000-0000-0000-0000-000000000002'::uuid)::text`, "other-owner-pending"), "false", "other-owner-pending");
  } finally { await fixture.cleanup(); }
}

async function verifyReferenceTransitions(): Promise<void> {
  const fixture = createFixture("refs");
  try {
    const imageId = await reserveReady(fixture, "image");
    const post = await writePost(fixture, [imageId]);
    let currentRevision = post.revision;
    const updated = await scalar(`SET ROLE service_role; SELECT result.revision::text FROM public.write_board_post_with_images(${post.postId}, '${ownerId}'::uuid, ${currentRevision}, '${fixture.runId}-updated', 'content', 'free', NULL, false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY[]::uuid[], NULL) AS result`, "last-ref-delete-pending");
    currentRevision = Number(updated);
    equal(await scalar(`SELECT image_row.status FROM public.board_image_objects AS image_row WHERE image_row.id = '${imageId}'::uuid`, "last-ref-delete-pending"), "delete_pending", "last-ref-delete-pending");
    if (!currentRevision) throw new Error("revision-update-missing");
  } finally { await fixture.cleanup(); }
}

async function verifyAttachDetachRace(): Promise<void> {
  const fixture = createFixture("attach-detach");
  try {
    const imageId = await reserveReady(fixture, "race");
    const postA = await writePost(fixture, [imageId]);
    const postB = await writePost(fixture, []);
    await Promise.all([
      sql(`SET ROLE service_role; SELECT * FROM public.write_board_post_with_images(${postA.postId}, '${ownerId}'::uuid, ${postA.revision}, '${fixture.runId}-a', 'content', 'free', NULL, false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY[]::uuid[], NULL);`),
      sql(`SET ROLE service_role; SELECT * FROM public.write_board_post_with_images(${postB.postId}, '${ownerId}'::uuid, ${postB.revision}, '${fixture.runId}-b', 'content', 'free', NULL, false, 'fixture', '${ownerId}'::uuid, NULL, NULL, NULL, NULL, NULL, ARRAY['${imageId}'::uuid], NULL);`),
    ]);
    equal(await scalar(`SELECT ((image_row.status = 'ready' AND (SELECT count(*) FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${postB.postId} AND ref_row.image_id = image_row.id) = 1) OR (image_row.status IN ('delete_pending','deleting') AND NOT EXISTS (SELECT 1 FROM public.board_post_image_refs AS ref_row WHERE ref_row.image_id = image_row.id)))::text FROM public.board_image_objects AS image_row WHERE image_row.id = '${imageId}'::uuid`, "attach-vs-detach-result"), "true", "attach-vs-detach-result");
  } finally { await fixture.cleanup(); }
}

async function verifyConcurrentClaims(): Promise<void> {
  const fixture = createFixture("claims");
  try {
    for (const suffix of ["one", "two"]) {
      const key = `${fixture.runId}-${suffix}.png`;
      fixture.storageKeys.push(key);
      await sql(`SET ROLE service_role; INSERT INTO public.board_image_objects (bucket_id, storage_key, owner_user_id, status, delete_after) VALUES ('board-images-v2', '${key}', '${ownerId}'::uuid, 'delete_pending', now() - interval '1 minute');`);
    }
    const workerSql = "SET ROLE service_role; SELECT coalesce(string_agg(result.image_id::text, ','), '') FROM public.claim_board_image_deletions(20, now(), 300) AS result";
    const [one, two] = await Promise.all([sql(workerSql), sql(workerSql)]);
    const workerOneIds = one.split(/\r?\n/).at(-1)?.split(",").filter(Boolean) ?? [];
    const workerTwoIds = two.split(/\r?\n/).at(-1)?.split(",").filter(Boolean) ?? [];
    equal(String(workerOneIds.filter((id) => workerTwoIds.includes(id)).length), "0", "concurrent-worker-claim");
    equal(await scalar(`SELECT count(DISTINCT image_row.id)::text FROM public.board_image_objects AS image_row WHERE image_row.storage_key LIKE '${fixture.runId}%' AND image_row.status = 'deleting'`, "concurrent-worker-claim"), "2", "concurrent-worker-claim");
  } finally { await fixture.cleanup(); }
}

async function verifyLegacyBackfill(): Promise<void> {
  const fixture = createFixture("legacy");
  try {
    const key = `${fixture.runId}-canonical.png`;
    fixture.storageKeys.push(key);
    await sql(`INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('images', '${key}', '${ownerId}'::uuid, '{"mimetype":"image/png","size":100}'::jsonb);`);
    const canonical = `https://fixture.supabase.co/storage/v1/object/public/images/${key}`;
    const postId = Number(await scalar(`INSERT INTO public.posts (title, content, category, author) VALUES ('${fixture.runId}-canonical', '<img src="${canonical}">', 'free', 'fixture') RETURNING id`, "legacy-backfill"));
    fixture.postIds.push(postId);
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718203104_board_image_storage_ownership.sql"), "utf8");
    await sql(migration);
    equal(await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row JOIN public.board_image_objects AS image_row ON image_row.id = ref_row.image_id WHERE ref_row.post_id = ${postId} AND image_row.status = 'legacy_retained'`, "legacy-backfill"), "1", "legacy-backfill");
  } finally { await fixture.cleanup(); }
}

async function verifyLeaseRecovery(): Promise<void> {
  const fixture = createFixture("lease");
  try {
    const key = `${fixture.runId}-lease.png`;
    fixture.storageKeys.push(key);
    const imageId = await scalar(`SET ROLE service_role; INSERT INTO public.board_image_objects (bucket_id, storage_key, owner_user_id, status, delete_after) VALUES ('board-images-v2', '${key}', '${ownerId}'::uuid, 'delete_pending', now() - interval '1 minute') RETURNING id`, "lease-recovery");
    const token = await scalar(`SET ROLE service_role; SELECT result.lease_token FROM public.claim_board_image_deletions(1, now(), 300) AS result WHERE result.image_id = '${imageId}'::uuid`, "lease-recovery");
    equal(await scalar(`SET ROLE service_role; SELECT public.finalize_board_image_deletion('${imageId}'::uuid, '${token}'::uuid, false)::text`, "lease-recovery"), "true", "lease-recovery");
  } finally { await fixture.cleanup(); }
}

async function runAllScenarios(): Promise<void> {
  await verifyAclAndOwnership();
  await verifyReferenceTransitions();
  await verifyAttachDetachRace();
  await verifyConcurrentClaims();
  await verifyLegacyBackfill();
  await verifyLeaseRecovery();
}

async function main(): Promise<void> {
  await runAllScenarios();
  await runAllScenarios();
  process.stdout.write("board-image-storage-migration: fixture verification passed\n");
}

void main();
