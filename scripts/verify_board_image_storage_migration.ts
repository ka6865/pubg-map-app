import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configuredDatabaseUrl = process.env.BOARD_IMAGE_STORAGE_TEST_DATABASE_URL?.trim();
const configuredOwnerId = process.env.BOARD_IMAGE_STORAGE_TEST_OWNER_ID?.trim();
if (!configuredDatabaseUrl) throw new Error("BOARD_IMAGE_STORAGE_TEST_DATABASE_URL-missing");
if (!configuredOwnerId?.match(/^[0-9a-f-]{36}$/i)) throw new Error("BOARD_IMAGE_STORAGE_TEST_OWNER_ID-missing-or-invalid");
const databaseUrl: string = configuredDatabaseUrl;
const ownerId: string = configuredOwnerId;
if (!new Set(["127.0.0.1", "::1", "localhost"]).has(new URL(databaseUrl).hostname)) {
  throw new Error("unsafe-board-image-storage-test-database-url");
}

function sql(statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.PSQL_BIN?.trim() || "psql", ["-X", databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", statement], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code: number | null) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr.trim() || `psql-exit-${code}`)));
  });
}

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function uuidArray(ids: string[]): string {
  if (ids.length === 0) return "ARRAY[]::uuid[]";
  return `ARRAY[${ids.map((id) => `${quote(id)}::uuid`).join(",")}]::uuid[]`;
}
function bigintArray(ids: number[]): string {
  return ids.length === 0 ? "ARRAY[]::bigint[]" : `ARRAY[${ids.join(",")}]::bigint[]`;
}
function textArray(values: string[]): string {
  return values.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${values.map(quote).join(",")}]::text[]`;
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

type Fixture = { runId: string; postIds: number[]; imageIds: string[]; storageKeys: string[]; authUserIds: string[]; cleanup: () => Promise<void> };

function createFixture(name: string): Fixture {
  const runId = `verify-board-image-${name}-${crypto.randomUUID()}`;
  const postIds: number[] = [];
  const imageIds: string[] = [];
  const storageKeys: string[] = [];
  const authUserIds: string[] = [];
  const cleanup = async (): Promise<void> => {
    await sql(`SET ROLE service_role;
      DELETE FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ANY(${bigintArray(postIds)}) OR ref_row.image_id = ANY(${uuidArray(imageIds)});
      DELETE FROM public.board_image_objects AS image_row WHERE image_row.id = ANY(${uuidArray(imageIds)}) OR image_row.storage_key = ANY(${textArray(storageKeys)}) OR image_row.storage_key LIKE ${quote(`${runId}%`)};
      DELETE FROM public.posts AS post_row WHERE post_row.id = ANY(${bigintArray(postIds)});
      DELETE FROM storage.objects AS storage_object WHERE storage_object.name = ANY(${textArray(storageKeys)}) OR storage_object.name LIKE ${quote(`${runId}%`)};`);
    equal(await scalar(`SELECT count(*)::text FROM public.posts AS post_row WHERE post_row.id = ANY(${bigintArray(postIds)})`, "cleanup-post-residue"), "0", "cleanup-post-residue");
    equal(await scalar(`SELECT count(*)::text FROM public.board_image_objects AS image_row WHERE image_row.id = ANY(${uuidArray(imageIds)}) OR image_row.storage_key LIKE ${quote(`${runId}%`)}`, "cleanup-image-residue"), "0", "cleanup-image-residue");
    equal(await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ANY(${bigintArray(postIds)}) OR ref_row.image_id = ANY(${uuidArray(imageIds)})`, "cleanup-ref-residue"), "0", "cleanup-ref-residue");
    equal(await scalar(`SELECT count(*)::text FROM storage.objects AS storage_object WHERE storage_object.name = ANY(${textArray(storageKeys)}) OR storage_object.name LIKE ${quote(`${runId}%`)}`, "cleanup-storage-residue"), "0", "cleanup-storage-residue");
    if (authUserIds.length > 0) await sql(`DELETE FROM auth.users AS user_row WHERE user_row.id = ANY(${uuidArray(authUserIds)})`);
  };
  return { runId, postIds, imageIds, storageKeys, authUserIds, cleanup };
}

async function ensureAuthUser(fixture: Fixture, userId: string): Promise<void> {
  const inserted = await sql(`INSERT INTO auth.users (id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES (${quote(userId)}::uuid, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()) ON CONFLICT (id) DO NOTHING RETURNING id::text`);
  if (inserted.split(/\r?\n/).includes(userId)) fixture.authUserIds.push(userId);
}

async function withFixture(name: string, scenario: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = createFixture(name);
  await fixture.cleanup();
  try {
    await scenario(fixture);
  } finally {
    await fixture.cleanup();
    await fixture.cleanup();
  }
}

async function reserve(fixture: Fixture, suffix: string, mime = "image/png", maxBytes = 100): Promise<{ imageId: string; key: string }> {
  const imageId = await scalar(`SET ROLE service_role; SELECT result.image_id FROM public.reserve_board_image_upload(${quote(ownerId)}, ${quote(mime)}, ${maxBytes}) AS result`, "reserve-ready");
  const key = `${fixture.runId}-${suffix}.png`;
  fixture.imageIds.push(imageId);
  fixture.storageKeys.push(key);
  await sql(`SET ROLE service_role; UPDATE public.board_image_objects AS image_row SET storage_key = ${quote(key)} WHERE image_row.id = ${quote(imageId)}::uuid;`);
  return { imageId, key };
}
async function reserveReady(fixture: Fixture, suffix: string): Promise<string> {
  const reserved = await reserve(fixture, suffix);
  await sql(`SET ROLE service_role; INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('board-images-v2', ${quote(reserved.key)}, ${quote(ownerId)}::uuid, '{"mimetype":"image/png","size":100}'::jsonb);`);
  equal(await scalar(`SET ROLE service_role; SELECT public.complete_board_image_upload(${quote(reserved.imageId)}::uuid, ${quote(ownerId)}::uuid)::text`, "complete-ready"), "true", "complete-ready");
  return reserved.imageId;
}
async function writePost(fixture: Fixture, imageIds: string[], thumbnailImageId: string | null = null): Promise<{ postId: number; revision: number }> {
  const result = await scalar(`SET ROLE service_role; SELECT result.post_id::text || ':' || result.revision::text FROM public.write_board_post_with_images(NULL, ${quote(ownerId)}::uuid, 0, ${quote(`${fixture.runId}-${crypto.randomUUID()}`)}, 'content', 'free', NULL, false, 'fixture', ${quote(ownerId)}::uuid, NULL, NULL, NULL, NULL, NULL, ${uuidArray(imageIds)}, ${thumbnailImageId ? `${quote(thumbnailImageId)}::uuid` : "NULL"}) AS result`, "write-post");
  const [postId, revision] = result.split(":").map(Number);
  fixture.postIds.push(postId);
  return { postId, revision };
}
async function updatePost(postId: number, revision: number, imageIds: string[], thumbnailImageId: string | null, label: string): Promise<string> {
  return scalar(`SET ROLE service_role; SELECT result.result_code || ':' || result.revision::text FROM public.write_board_post_with_images(${postId}, ${quote(ownerId)}::uuid, ${revision}, 'updated', 'content', 'free', NULL, false, 'fixture', ${quote(ownerId)}::uuid, NULL, NULL, NULL, NULL, NULL, ${uuidArray(imageIds)}, ${thumbnailImageId ? `${quote(thumbnailImageId)}::uuid` : "NULL"}) AS result`, label);
}
async function imageStatus(imageId: string, label: string): Promise<string> {
  return scalar(`SELECT image_row.status FROM public.board_image_objects AS image_row WHERE image_row.id = ${quote(imageId)}::uuid`, label);
}

async function verifyAclAndOwnership(): Promise<void> {
  await withFixture("acl", async (fixture) => {
    for (const [table, label] of [["board_image_objects", "board-image-objects-rls"], ["board_post_image_refs", "board-post-image-refs-rls"]] as const) {
      equal(await scalar(`SELECT class_row.relrowsecurity::text FROM pg_class AS class_row JOIN pg_namespace AS namespace_row ON namespace_row.oid = class_row.relnamespace WHERE namespace_row.nspname = 'public' AND class_row.relname = ${quote(table)}`, label), "true", label);
    }
    equal(await scalar("SELECT count(*)::text FROM pg_policies AS policy_row WHERE policy_row.schemaname = 'public' AND policy_row.tablename IN ('board_image_objects', 'board_post_image_refs')", "public-policy-count"), "0", "public-policy-count");
    await rejected("SET ROLE anon; SELECT * FROM public.board_image_objects", "anon-table-denied");
    await rejected("SET ROLE authenticated; SELECT * FROM public.board_post_image_refs", "authenticated-table-denied");
    const signatures = ["public.reserve_board_image_upload(uuid,text,bigint)", "public.complete_board_image_upload(uuid,uuid)", "public.write_board_post_with_images(bigint,uuid,bigint,text,text,text,text,boolean,text,uuid,text,text,text,text,jsonb,uuid[],uuid)", "public.claim_board_image_deletions(integer,timestamptz,integer)", "public.claim_board_image_deletions_for_owner(uuid,uuid[],timestamptz,integer)", "public.finalize_board_image_deletion(uuid,uuid,boolean)"];
    for (const signature of signatures) {
      equal(await scalar(`SELECT count(*)::text FROM pg_proc AS function_row CROSS JOIN LATERAL aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) AS acl_row WHERE function_row.oid = to_regprocedure(${quote(signature)}) AND acl_row.grantee = 0 AND acl_row.privilege_type = 'EXECUTE'`, "public-rpc-denied"), "0", "public-rpc-denied");
    }
    for (const signature of signatures) for (const [role, label] of [["anon", "anon-rpc-denied"], ["authenticated", "authenticated-rpc-denied"]] as const) {
      equal(await scalar(`SELECT has_function_privilege(${quote(role)}, ${quote(signature)}, 'EXECUTE')::text`, label), "false", label);
    }
    for (const signature of signatures) equal(await scalar(`SELECT has_function_privilege('service_role', ${quote(signature)}, 'EXECUTE')::text`, "service-role-execute"), "true", "service-role-execute");
    const pending = await reserve(fixture, "other-owner");
    equal(await scalar(`SET ROLE service_role; SELECT public.complete_board_image_upload(${quote(pending.imageId)}::uuid, '00000000-0000-0000-0000-000000000002'::uuid)::text`, "other-owner-complete"), "false", "other-owner-complete");
  });
}

async function verifyUploadValidationAndReferences(): Promise<void> {
  await withFixture("references", async (fixture) => {
    const mime = await reserve(fixture, "mime");
    await sql(`SET ROLE service_role; INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('board-images-v2', ${quote(mime.key)}, ${quote(ownerId)}::uuid, '{"mimetype":"image/jpeg","size":100}'::jsonb);`);
    equal(await scalar(`SET ROLE service_role; SELECT public.complete_board_image_upload(${quote(mime.imageId)}::uuid, ${quote(ownerId)}::uuid)::text`, "mime-violation"), "false", "mime-violation");
    const size = await reserve(fixture, "size");
    await sql(`SET ROLE service_role; INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('board-images-v2', ${quote(size.key)}, ${quote(ownerId)}::uuid, '{"mimetype":"image/png","size":101}'::jsonb);`);
    equal(await scalar(`SET ROLE service_role; SELECT public.complete_board_image_upload(${quote(size.imageId)}::uuid, ${quote(ownerId)}::uuid)::text`, "size-violation"), "false", "size-violation");
    const shared = await reserveReady(fixture, "shared");
    const contentThumbnail = await writePost(fixture, [shared], shared);
    const contentRemoved = await updatePost(contentThumbnail.postId, contentThumbnail.revision, [], shared, "content-thumbnail-preserved");
    equal(contentRemoved.split(":")[0], "ok", "content-thumbnail-preserved");
    equal(await imageStatus(shared, "content-thumbnail-preserved"), "ready", "content-thumbnail-preserved");
    const twoPosts = await writePost(fixture, [shared]);
    const remainingThumbnail = Number(contentRemoved.split(":")[1]);
    await updatePost(contentThumbnail.postId, remainingThumbnail, [], null, "two-posts-preserved");
    equal(await imageStatus(shared, "two-posts-preserved"), "ready", "two-posts-preserved");
    await updatePost(twoPosts.postId, twoPosts.revision, [], null, "last-ref-delete-pending");
    equal(await imageStatus(shared, "last-ref-delete-pending"), "delete_pending", "last-ref-delete-pending");
    const legacyKey = `${fixture.runId}-legacy-retained.png`;
    fixture.storageKeys.push(legacyKey);
    const legacyId = await scalar(`SET ROLE service_role; INSERT INTO public.board_image_objects (bucket_id, storage_key, status) VALUES ('images', ${quote(legacyKey)}, 'legacy_retained') RETURNING id`, "legacy-retained-create");
    fixture.imageIds.push(legacyId);
    const legacyPost = await writePost(fixture, []);
    await sql(`SET ROLE service_role; INSERT INTO public.board_post_image_refs (post_id, image_id, usage) VALUES (${legacyPost.postId}, ${quote(legacyId)}::uuid, 'content');`);
    equal((await updatePost(legacyPost.postId, legacyPost.revision, [], null, "legacy-retained-detach")).split(":")[0], "ok", "legacy-retained-detach");
    equal(await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${legacyPost.postId} AND ref_row.image_id = ${quote(legacyId)}::uuid`, "legacy-retained-ref-count"), "0", "legacy-retained-ref-count");
    equal(await imageStatus(legacyId, "legacy-retained-preserved"), "legacy_retained", "legacy-retained-preserved");
    equal(await scalar(`SET ROLE service_role; SELECT count(*)::text FROM public.claim_board_image_deletions(20, now(), 300) AS result WHERE result.image_id = ${quote(legacyId)}::uuid`, "legacy-retained-claim-count"), "0", "legacy-retained-claim-count");
  });
}

async function verifyRevisionAndAttachDetachRace(): Promise<void> {
  await withFixture("attach-detach", async (fixture) => {
    const imageId = await reserveReady(fixture, "race");
    const postA = await writePost(fixture, [imageId]);
    const postB = await writePost(fixture, []);
    const currentRevision = postA.revision;
    const before = await scalar(`SELECT post_row.revision::text || ':' || (SELECT count(*) FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${postA.postId})::text || ':' || (SELECT image_row.status FROM public.board_image_objects AS image_row WHERE image_row.id = ${quote(imageId)}::uuid) FROM public.posts AS post_row WHERE post_row.id = ${postA.postId}`, "revision-conflict-before");
    equal((await updatePost(postA.postId, currentRevision + 1, [], null, "revision-conflict")).split(":")[0], "revision_conflict", "revision-conflict");
    const after = await scalar(`SELECT post_row.revision::text || ':' || (SELECT count(*) FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${postA.postId})::text || ':' || (SELECT image_row.status FROM public.board_image_objects AS image_row WHERE image_row.id = ${quote(imageId)}::uuid) FROM public.posts AS post_row WHERE post_row.id = ${postA.postId}`, "revision-conflict-after");
    equal(after, before, "revision-conflict");
    const outcomes = await Promise.allSettled([
      updatePost(postA.postId, currentRevision, [], null, "attach-detach-detach"),
      updatePost(postB.postId, postB.revision, [imageId], null, "attach-detach-attach"),
    ]);
    if (outcomes.every((outcome) => outcome.status === "rejected")) throw new Error("attach-detach-unexpected-settlement");
    const postARefs = await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${postA.postId} AND ref_row.image_id = ${quote(imageId)}::uuid`, "attach-detach-post-a");
    const postBRefs = await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${postB.postId} AND ref_row.image_id = ${quote(imageId)}::uuid`, "attach-detach-post-b");
    const totalRefs = await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.image_id = ${quote(imageId)}::uuid`, "attach-detach-total-refs");
    const status = await imageStatus(imageId, "attach-detach-status");
    const readyState = status === "ready" && postARefs === "0" && postBRefs === "1" && totalRefs === "1";
    const deletedState = status === "delete_pending" && totalRefs === "0";
    if (!readyState && postARefs !== "0") throw new Error("attach-detach-invalid-post-a-ref-count");
    if (!readyState && !deletedState && postBRefs !== "0") throw new Error("attach-detach-invalid-post-b-ref-count");
    const attachDetachResult = readyState || deletedState;
    if (!attachDetachResult) throw new Error("attach-detach-result: attach-detach-invalid-status");
  });
}

async function verifyOwnerScopedReleaseClaims(): Promise<void> {
  await withFixture("owner-release", async (fixture) => {
    const otherOwnerId = "00000000-0000-0000-0000-000000000002";
    await ensureAuthUser(fixture, otherOwnerId);
    const ownReady = await reserveReady(fixture, "own-ready");
    const ownPending = (await reserve(fixture, "own-pending")).imageId;
    const referenced = await reserveReady(fixture, "referenced");
    await writePost(fixture, [referenced]);
    const unrequested = await reserveReady(fixture, "unrequested");
    const createRegistry = async (suffix: string, ownerSql: string, status: string, leaseSql = "NULL"): Promise<string> => {
      const key = `${fixture.runId}-${suffix}.png`;
      fixture.storageKeys.push(key);
      const imageId = await scalar(`SET ROLE service_role; INSERT INTO public.board_image_objects (bucket_id, storage_key, owner_user_id, status, delete_lease_until) VALUES ('board-images-v2', ${quote(key)}, ${ownerSql}, ${quote(status)}, ${leaseSql}) RETURNING id`, suffix);
      fixture.imageIds.push(imageId);
      return imageId;
    };
    const otherOwner = await createRegistry("other-owner", `${quote(otherOwnerId)}::uuid`, "ready");
    const deletePending = await createRegistry("delete-pending", `${quote(ownerId)}::uuid`, "delete_pending");
    const activeDeleting = await createRegistry("active-deleting", `${quote(ownerId)}::uuid`, "deleting", "now() + interval '5 minutes'");
    const expiredDeleting = await createRegistry("expired-deleting", `${quote(ownerId)}::uuid`, "deleting", "now() - interval '1 minute'");
    const requested = [ownReady, ownPending, otherOwner, referenced, deletePending, activeDeleting, expiredDeleting, ownReady];
    const claimed = (await sql(`SET ROLE service_role; SELECT result.image_id::text FROM public.claim_board_image_deletions_for_owner(${quote(ownerId)}::uuid, ${uuidArray(requested)}, now(), 300) AS result ORDER BY result.image_id`)).split(/\r?\n/).filter(Boolean);
    equal(String(claimed.includes(ownReady)), "true", "owner-release-own-ready");
    equal(String(claimed.includes(ownPending)), "true", "owner-release-own-pending");
    equal(String(claimed.includes(otherOwner)), "false", "owner-release-other-owner-excluded");
    equal(String(claimed.includes(referenced)), "false", "owner-release-referenced");
    equal(String(claimed.includes(unrequested)), "false", "owner-release-unrequested");
    equal(String(claimed.includes(activeDeleting)), "false", "owner-release-active-deleting");
    equal(String(claimed.includes(expiredDeleting)), "true", "owner-release-expired-deleting");
    equal(String(claimed.filter((id) => id === ownReady).length), "1", "owner-release-duplicate-once");
    equal(String(claimed.filter((id) => id === deletePending).length), "1", "owner-release-delete-pending-once");
    equal(await imageStatus(deletePending, "owner-release-delete-pending-status"), "deleting", "owner-release-delete-pending-status");
    const otherOwnerClaimed = await scalar(`SET ROLE service_role; SELECT count(*)::text FROM public.claim_board_image_deletions_for_owner(${quote(otherOwnerId)}::uuid, ${uuidArray([otherOwner])}, now(), 300) AS result WHERE result.image_id = ${quote(otherOwner)}::uuid`, "owner-release-other-owner-own-claim");
    equal(otherOwnerClaimed, "1", "owner-release-other-owner-own-claim");
    await rejected(`SET ROLE service_role; SELECT * FROM public.claim_board_image_deletions_for_owner(${quote(ownerId)}::uuid, ARRAY[]::uuid[], now(), 300)`, "owner-release-empty-rejected");
    await rejected(`SET ROLE service_role; SELECT * FROM public.claim_board_image_deletions_for_owner(${quote(ownerId)}::uuid, ARRAY[NULL]::uuid[], now(), 300)`, "owner-release-null-rejected");
    await rejected(`SET ROLE service_role; SELECT * FROM public.claim_board_image_deletions_for_owner(${quote(ownerId)}::uuid, ${uuidArray(Array.from({ length: 21 }, () => ownReady))}, now(), 300)`, "owner-release-21-rejected");
  });
}

async function verifyClaimsAndRecovery(): Promise<void> {
  await withFixture("claims", async (fixture) => {
    const makeCandidate = async (suffix: string, status: "pending" | "delete_pending" | "deleting"): Promise<string> => {
      const key = `${fixture.runId}-${suffix}.png`;
      fixture.storageKeys.push(key);
      const dates = status === "pending" ? "expires_at" : status === "deleting" ? "delete_lease_until" : "delete_after";
      const imageId = await scalar(`SET ROLE service_role; INSERT INTO public.board_image_objects (bucket_id, storage_key, owner_user_id, status, ${dates}) VALUES ('board-images-v2', ${quote(key)}, ${quote(ownerId)}::uuid, ${quote(status)}, now() - interval '1 minute') RETURNING id`, suffix);
      fixture.imageIds.push(imageId);
      return imageId;
    };
    const pending = await makeCandidate("expired-pending", "pending");
    const deleting = await makeCandidate("expired-deleting", "deleting");
    const retry = await makeCandidate("retry", "delete_pending");
    const workerSql = "SET ROLE service_role; SELECT coalesce(string_agg(result.image_id::text, ','), '') FROM public.claim_board_image_deletions(20, now(), 300) AS result";
    const [one, two] = await Promise.all([sql(workerSql), sql(workerSql)]);
    const workerOneIds = one.split(/\r?\n/).at(-1)?.split(",").filter(Boolean) ?? [];
    const workerTwoIds = two.split(/\r?\n/).at(-1)?.split(",").filter(Boolean) ?? [];
    equal(String(workerOneIds.filter((id) => workerTwoIds.includes(id)).length), "0", "concurrent-worker-claim");
    for (const [imageId, label] of [[pending, "expired-pending-claim"], [deleting, "expired-deleting-reclaim"], [retry, "finalize-false-recovery"]] as const) equal(await imageStatus(imageId, label), "deleting", label);
    const token = await scalar(`SELECT image_row.delete_lease_token::text FROM public.board_image_objects AS image_row WHERE image_row.id = ${quote(retry)}::uuid`, "finalize-false-token");
    equal(await scalar(`SET ROLE service_role; SELECT public.finalize_board_image_deletion(${quote(retry)}::uuid, ${quote(token)}::uuid, false)::text`, "finalize-false-recovery"), "true", "finalize-false-recovery");
    equal(await scalar(`SELECT (image_row.status = 'delete_pending' AND image_row.delete_after >= now() + interval '23 hours')::text FROM public.board_image_objects AS image_row WHERE image_row.id = ${quote(retry)}::uuid`, "finalize-false-recovery"), "true", "finalize-false-recovery");
  });
}

async function verifyLegacyBackfill(): Promise<void> {
  await withFixture("legacy", async (fixture) => {
    const key = `${fixture.runId}-canonical.png`;
    fixture.storageKeys.push(key);
    await sql(`INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('images', ${quote(key)}, ${quote(ownerId)}::uuid, '{"mimetype":"image/png","size":100}'::jsonb);`);
    const urls = [
      `https://fixture.supabase.co/storage/v1/object/public/images/${key}`,
      `https://fixture.supabase.co/storage/v1/object/public/images/${key.replace("-", "%2D")}`,
      `https://example.com/storage/v1/object/public/images/${key}`,
      `https://not-supabase.co/storage/v1/object/public/images/${key}`,
    ];
    for (const [index, url] of urls.entries()) {
      const postId = Number(await scalar(`INSERT INTO public.posts (title, content, category, author) VALUES (${quote(`${fixture.runId}-${index}`)}, ${quote(`<img src="${url}">`)}, 'free', 'fixture') RETURNING id`, "legacy-post"));
      fixture.postIds.push(postId);
    }
    await sql(readFileSync(resolve(process.cwd(), "supabase/migrations/20260718203104_board_image_storage_ownership.sql"), "utf8"));
    for (const [index, expected, label] of [[0, "1", "legacy-canonical-ref-count"], [1, "0", "legacy-percent-encoded-ref-count"], [2, "0", "legacy-external-ref-count"], [3, "0", "legacy-lookalike-ref-count"]] as const) {
      equal(await scalar(`SELECT count(*)::text FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = ${fixture.postIds[index]}`, label), expected, label);
    }
  });
}

async function runAllScenarios(): Promise<void> {
  await verifyAclAndOwnership();
  await verifyUploadValidationAndReferences();
  await verifyRevisionAndAttachDetachRace();
  await verifyOwnerScopedReleaseClaims();
  await verifyClaimsAndRecovery();
  await verifyLegacyBackfill();
}

async function main(): Promise<void> {
  await runAllScenarios();
  await runAllScenarios();
  process.stdout.write("board-image-storage-migration: fixture verification passed\n");
}

void main();
