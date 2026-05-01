import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RETENTION_MAP_DAYS = 7;     // 지도 데이터: 7일 보관
const RETENTION_ANALYZE_DAYS = 14; // 분석 데이터: 14일 보관

async function cleanup() {
  console.log("🧹 [Storage Cleanup] Starting cleanup process...");

  const { data: files, error } = await supabase.storage
    .from('telemetry')
    .list('', { limit: 1000 }); // 한 번에 최대 1000개 검사

  if (error) {
    console.error("❌ Failed to list files:", error.message);
    return;
  }

  if (!files || files.length === 0) {
    console.log("✅ No files to clean up.");
    return;
  }

  const now = new Date();
  const toDelete: string[] = [];

  for (const file of files) {
    if (!file.created_at) continue; // 생성일이 없으면 건너뜀
    const createdAt = new Date(file.created_at);
    const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (file.name.endsWith("_map.json") && diffDays > RETENTION_MAP_DAYS) {
      toDelete.push(file.name);
    } else if (file.name.endsWith("_analyze.json") && diffDays > RETENTION_ANALYZE_DAYS) {
      toDelete.push(file.name);
    }
  }

  if (toDelete.length > 0) {
    console.log(`🗑️ Deleting ${toDelete.length} old files...`);
    const { error: deleteError } = await supabase.storage
      .from('telemetry')
      .remove(toDelete);

    if (deleteError) {
      console.error("❌ Delete error:", deleteError.message);
    } else {
      console.log(`✅ Successfully removed: ${toDelete.join(", ")}`);
    }
  } else {
    console.log("✅ All files are within the retention period.");
  }

  console.log("✨ Cleanup process finished.");
}

cleanup();
