import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import {
  auditProcessedTelemetryIdentity,
  deleteProcessedTelemetryIdentityTargets
} from "../lib/admin-agent/data-quality";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

function hasApplyFlag(): boolean {
  return process.argv.includes("--apply");
}

function hasJsonFlag(): boolean {
  return process.argv.includes("--json");
}

function getNumberArg(name: string): number | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function main() {
  const apply = hasApplyFlag();
  const json = hasJsonFlag();
  const supabase = createSupabaseServiceClient();
  const audit = await auditProcessedTelemetryIdentity(supabase, {
    recentDays: getNumberArg("--recent-days"),
    maxRows: getNumberArg("--max-rows"),
    pageSize: getNumberArg("--page-size") || 1000,
    sampleLimit: getNumberArg("--sample-limit") || 10,
    targetLimit: getNumberArg("--target-limit") || 1000
  });

  if (json) {
    console.info(JSON.stringify(audit, null, 2));
  }

  console.info("\n================ PROCESSED TELEMETRY IDENTITY AUDIT ================");
  console.info(`mode: ${apply ? "apply" : "dry-run"}`);
  console.info(`recent days: ${audit.recentDays || "all"}`);
  console.info(`scanned rows: ${audit.scannedRows}${audit.truncated ? " (truncated)" : ""}`);
  console.info(`mismatch rows: ${audit.mismatchCount}`);
  console.info(`deletion candidates: ${audit.deletionCandidateCount}`);
  console.info(`missing platform column rows: ${audit.missingPlatformColumnRows}`);
  console.info("samples:");
  console.info(JSON.stringify(audit.samples, null, 2));

  if (!apply || audit.deletionTargets.length === 0) {
    console.info("삭제는 실행하지 않았습니다. 실제 삭제는 --apply 옵션이 있을 때만 수행합니다.");
    console.info("====================================================================\n");
    return;
  }

  if (audit.missingPlatformColumnRows > 0) {
    throw new Error("--apply 삭제는 platform 컬럼 마이그레이션 적용 후에만 실행할 수 있습니다.");
  }

  const result = await deleteProcessedTelemetryIdentityTargets(supabase, audit.deletionTargets);

  console.info(`delete requested: ${result.requested}`);
  console.info(`deleted rows: ${result.deleted}`);
  console.info(`skipped rows: ${result.skipped}`);
  console.info(`failed rows: ${result.failed}`);
  console.info(JSON.stringify(result.details.slice(0, 20), null, 2));
  console.info("====================================================================\n");
}

main().catch(error => {
  console.error("[processed telemetry identity audit] 실패:", error);
  process.exit(1);
});
