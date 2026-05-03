import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reset() {
  console.log("🧹 [Storage Reset] Starting reset process...");

  // 1. app-data/bluezone_data.json 삭제
  const { error: err1 } = await supabase.storage
    .from("app-data")
    .remove(["bluezone_data.json"]);
  console.log(err1 ? "❌ bluezone_data.json 삭제 실패" : "✅ bluezone_data.json 삭제 완료");

  // 2. telemetry 버킷 비우기 (페이지네이션 적용)
  let allDeleted = 0;
  while (true) {
    const { data: files } = await supabase.storage.from("telemetry").list("", { limit: 100 });
    if (!files || files.length === 0) break;

    const names = files.map(f => f.name);
    const { error: err2 } = await supabase.storage.from("telemetry").remove(names);
    if (err2) {
      console.error("❌ telemetry 파일 삭제 중 에러:", err2.message);
      break;
    }
    allDeleted += names.length;
    console.log(`🗑️ telemetry 파일 ${allDeleted}개 삭제 중...`);
    if (files.length < 100) break;
  }
  console.log(`✅ telemetry 버킷 정리 완료 (총 ${allDeleted}개 삭제)`);
}

reset();
