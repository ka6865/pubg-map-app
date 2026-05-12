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

const TARGET_VERSION = 37;
const RETENTION_DAYS = 3;

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

  let totalDeleted = 0;

  while (true) {
    // 1. 삭제 대상 조회 (버전이 낮거나 오래된 데이터)
    const { data: targets, error: fetchError } = await supabase
      .from('match_master_telemetry')
      .select('match_id, storage_path')
      .or(`telemetry_version.lt.${TARGET_VERSION},created_at.lt.${expirationDate.toISOString()}`)
      .limit(500);

    if (fetchError) {
      console.error('❌ 대상 조회 실패:', fetchError.message);
      break;
    }

    if (!targets || targets.length === 0) {
      console.log('✅ 더 이상 정리할 데이터가 없습니다.');
      break;
    }

    console.log(`📦 이번 배치에서 ${targets.length}개의 정리 대상을 발견했습니다.`);

    const matchIds = targets.map(t => t.match_id);
    const storagePaths = targets.map(t => t.storage_path).filter(Boolean);

    // A. 스토리지 파일 삭제
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('telemetry')
        .remove(storagePaths);
      
      if (storageError) {
        console.warn(`⚠️ 스토리지 삭제 중 일부 오류 (무시):`, storageError.message);
      }
    }

    // B. 관련 DB 테이블 일괄 삭제
    // 1) processed_match_telemetry (분석 결과)
    await supabase.from('processed_match_telemetry').delete().in('match_id', matchIds);
    
    // 2) match_stats_raw (원본 통계)
    await supabase.from('match_stats_raw').delete().in('match_id', matchIds);
    
    // 3) match_master_telemetry (메타데이터 - 마지막에 삭제)
    const { error: dbError } = await supabase
      .from('match_master_telemetry')
      .delete()
      .in('match_id', matchIds);

    if (dbError) {
      console.error(`❌ DB 삭제 실패:`, dbError.message);
    } else {
      totalDeleted += targets.length;
    }
    
    console.log(`⏳ 현재까지 총 ${totalDeleted}개 데이터(파일+DB) 완전 삭제 완료...`);
  }

  // 4. [보너스] match_stats_raw 고립 데이터 강제 정리 (연결고리 끊긴 데이터들)
  console.log('🧹 남은 고립된 match_stats_raw 데이터 최종 정리 중...');
  const { error: finalOrphanError } = await supabase.rpc('delete_orphaned_stats');
  if (finalOrphanError) {
    console.warn('⚠️ 고립 데이터 정리 RPC 호출 실패 (수동 정리가 필요할 수 있음)');
  }

  console.log(`\n✨ [BGMS Smart Cleaner] 모든 작업 완료!`);
  console.log(`✅ 최종 ${totalDeleted}개의 경기 데이터가 시스템에서 완전히 제거되었습니다.`);
  console.log(`📉 이제 최신 로직(V${TARGET_VERSION})이 적용된 최근 ${RETENTION_DAYS}일치 데이터만 남게 됩니다.`);
}

smartCleanup().catch(console.error);
