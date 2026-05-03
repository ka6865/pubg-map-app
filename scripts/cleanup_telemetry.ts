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
const PAGE_SIZE = 1000; // Storage API 최대 한도

async function cleanup() {
  console.log("🧹 [Storage Cleanup] Starting cleanup process...");

  // ✅ 페이지네이션: 1,000개 초과 시 누락 없이 전체 파일 조회
  let allFiles: any[] = [];
  let offset = 0;

  while (true) {
    const { data: files, error } = await supabase.storage
      .from('telemetry')
      .list('', { limit: PAGE_SIZE, offset });

    if (error) {
      console.error("❌ Failed to list files:", error.message);
      break;
    }

    if (!files || files.length === 0) break;

    allFiles = allFiles.concat(files);

    // 마지막 페이지면 종료
    if (files.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allFiles.length === 0) {
    console.log("✅ No files to clean up.");
    return;
  }

  console.log(`📦 전체 파일 수: ${allFiles.length}개`);

  const now = new Date();
  const toDelete: string[] = [];

  for (const file of allFiles) {
    if (!file.created_at) continue;
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
    // ✅ 대량 삭제 시 1,000개 단위로 배치 처리 (Storage API 제한)
    for (let i = 0; i < toDelete.length; i += PAGE_SIZE) {
      const batch = toDelete.slice(i, i + PAGE_SIZE);
      const { error: deleteError } = await supabase.storage
        .from('telemetry')
        .remove(batch);

      if (deleteError) {
        console.error(`❌ Delete error (batch ${i}):`, deleteError.message);
      } else {
        console.log(`✅ Removed batch ${i / PAGE_SIZE + 1}: ${batch.length}개`);
      }
    }
  } else {
    console.log("✅ All files are within the retention period.");
  }

  console.log("✨ Cleanup process finished.");
}

cleanup();

