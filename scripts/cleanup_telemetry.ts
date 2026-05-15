import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// .env.local 파일 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 누락되었습니다. .env.local 파일을 확인해주세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// 환경 변수에 따라 삭제 강도 조절 (Daily Action용)
const TARGET_VERSION = parseInt(process.env.CLEANUP_TARGET_VERSION || '56');
const RETENTION_DAYS = parseInt(process.env.CLEANUP_RETENTION_DAYS || '1');

async function smartCleanup() {
  console.log('🚀 [BGMS Smart Cleaner] 작업을 시작합니다...');
  
  const now = new Date();
  const expirationDate = new Date(now.getTime() - (RETENTION_DAYS * 24 * 60 * 60 * 1000));
  console.log(`📅 기준 날짜: ${expirationDate.toISOString()} (이전 데이터 삭제)`);
  console.log(`🔢 기준 버전: V${TARGET_VERSION} (미만 버전 삭제)`);

  // 0. 고립된 데이터 정리 (match_master_telemetry에 없는 match_stats_raw 삭제)
  console.log('🧹 고립된 match_stats_raw 데이터 확인 중...');
  const { data: orphanedStats, error: orphanError } = await supabase
    .rpc('get_orphaned_match_ids'); // RPC가 없다면 쿼리로 대체 가능하나 효율을 위해 별도 처리

  // RPC가 없는 경우를 대비한 수동 고립 데이터 체크 (제한적)
  if (orphanError) {
     console.log('💡 고립 데이터 정리를 위한 RPC가 없습니다. 기본 클린업을 진행합니다.');
  }

  let totalMatchesDeleted = 0;
  let totalFilesDeleted = 0;

  while (true) {
    const { data: targets, error: fetchError } = await supabase
      .from('match_master_telemetry')
      .select('match_id, storage_path')
      .or(`telemetry_version.lt.${TARGET_VERSION},created_at.lt.${expirationDate.toISOString()}`)
      .limit(50);

    if (fetchError) {
      console.error('❌ 대상 조회 실패:', fetchError.message);
      break;
    }

    if (!targets || targets.length === 0) break;

    const matchIds = targets.map(t => t.match_id);
    const storagePaths = targets.map(t => t.storage_path).filter(Boolean);

    if (storagePaths.length > 0) {
      const { data: deletedFiles, error: storageError } = await supabase.storage
        .from('telemetry')
        .remove(storagePaths);
      
      if (!storageError && deletedFiles) {
        totalFilesDeleted += deletedFiles.length;
      }
    }

    const { error: dbError } = await supabase
      .from('match_master_telemetry')
      .delete()
      .in('match_id', matchIds);

    if (!dbError) {
      totalMatchesDeleted += targets.length;
    }
    
    console.log(`⏳ 처리 중... (DB: ${totalMatchesDeleted}개, Storage: ${totalFilesDeleted}개 삭제됨)`);
  }

  // 4. 고립된 스토리지 파일 정리
  console.log('🧹 고립된 스토리지 파일 최종 정리 중...');
  const { data: bucketFiles } = await supabase.storage.from('telemetry').list('', { limit: 1000 });
  if (bucketFiles && bucketFiles.length > 0) {
    const { data: activeRecords } = await supabase.from('match_master_telemetry').select('storage_path');
    const activePaths = new Set(activeRecords?.map(r => r.storage_path) || []);
    const orphanedFiles = bucketFiles.map(f => f.name).filter(name => !activePaths.has(name));

    if (orphanedFiles.length > 0) {
      const { data: deletedOrphans } = await supabase.storage.from('telemetry').remove(orphanedFiles);
      if (deletedOrphans) totalFilesDeleted += deletedOrphans.length;
    }
  }

  // 5. 최종 통계 및 용량 확인
  console.log('\n📊 [최종 작업 통계]');
  const { data: finalMatches } = await supabase.from('match_master_telemetry').select('count', { count: 'exact' });
  
  // 용량 합산 로직 (페이지네이션)
  let totalSizeBytes = 0;
  let totalFileCount = 0;
  let offset = 0;
  while (true) {
    const { data: files } = await supabase.storage.from('telemetry').list('', { limit: 100, offset });
    if (!files || files.length === 0) break;
    files.forEach(f => {
      totalSizeBytes += (f.metadata?.size || 0);
      totalFileCount++;
    });
    if (files.length < 100) break;
    offset += 100;
  }

  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  console.log(`──────────────────────────────────────`);
  console.log(`🗑️  삭제된 데이터: DB ${totalMatchesDeleted}개 / Storage ${totalFilesDeleted}개`);
  console.log(`📉 남은 데이터: DB ${finalMatches?.[0]?.count || 0}개 / Storage ${totalFileCount}개`);
  console.log(`💾 현재 스토리지 사용량: ${totalSizeMB} MB (${totalSizeGB} GB)`);
  console.log(`──────────────────────────────────────`);
  console.log(`✨ 모든 작업이 완료되었습니다.`);
}

smartCleanup().catch(console.error);
