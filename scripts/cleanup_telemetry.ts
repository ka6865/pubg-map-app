import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { listR2Files, deleteMultipleFromR2 } from '../lib/pubg-analysis/r2Service';
import { TELEMETRY_VERSION } from '../lib/pubg-analysis/constants';

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
const currentVersion = Math.floor(TELEMETRY_VERSION);
let envTargetVersion = parseInt(process.env.CLEANUP_TARGET_VERSION || '56');

// 안전 장치: CLEANUP_TARGET_VERSION이 현재 동작 중인 버전을 덮어쓰지 않도록 강제 제한 (활성 데이터 삭제 방지)
if (envTargetVersion >= currentVersion) {
  console.warn(`⚠️ 경고: CLEANUP_TARGET_VERSION (${envTargetVersion})이 현재 동작 중인 텔레메트리 버전 (${currentVersion})보다 크거나 같습니다.`);
  console.warn(`   안전을 위해 TARGET_VERSION을 활성 버전 미만인 ${currentVersion - 1}로 강제 강하 조정합니다.`);
  envTargetVersion = currentVersion - 1;
}

const TARGET_VERSION = envTargetVersion;
const RETENTION_DAYS = parseInt(process.env.CLEANUP_RETENTION_DAYS || '1');

async function smartCleanup() {
  console.log('🚀 [BGMS Smart Cleaner] 작업을 시작합니다...');
  
  const now = new Date();
  const expirationDate = new Date(now.getTime() - (RETENTION_DAYS * 24 * 60 * 60 * 1000));
  console.log(`📅 기준 날짜: ${expirationDate.toISOString()} (이전 데이터 삭제)`);
  console.log(`🔢 기준 버전: V${TARGET_VERSION} (미만 버전 삭제)`);

  // 0. 고립된 데이터 정리 (match_master_telemetry에 없는 match_stats_raw/processed_match_telemetry 삭제)
  console.log('🧹 고립된 상세 데이터 확인 및 정리 중...');
  try {
    const { data: orphanedMatches, error: orphanError } = await supabase
      .rpc('get_orphaned_match_ids');

    if (orphanError) {
      console.warn('⚠️ 고립된 match_id 조회 실패:', orphanError.message);
    } else if (orphanedMatches && orphanedMatches.length > 0) {
      const orphanedMatchIds = orphanedMatches.map((row: any) => row.match_id).filter(Boolean);
      console.log(`🧹 발견된 고립 매치 ID 개수: ${orphanedMatchIds.length}개. 정리를 진행합니다.`);
      
      // 1) match_stats_raw 삭제
      const { error: delStatsErr } = await supabase
        .from('match_stats_raw')
        .delete()
        .in('match_id', orphanedMatchIds);
      if (delStatsErr) {
        console.error('❌ 고립된 match_stats_raw 삭제 실패:', delStatsErr.message);
      } else {
        console.log(`✓ 고립된 match_stats_raw 데이터 정리 완료`);
      }
      
      // 2) processed_match_telemetry 삭제
      const { error: delProcessedErr } = await supabase
        .from('processed_match_telemetry')
        .delete()
        .in('match_id', orphanedMatchIds);
      if (delProcessedErr) {
        console.error('❌ 고립된 processed_match_telemetry 삭제 실패:', delProcessedErr.message);
      } else {
        console.log(`✓ 고립된 processed_match_telemetry 데이터 정리 완료`);
      }
    } else {
      console.log('✅ 고립된 매치 데이터가 없습니다.');
    }
  } catch (err) {
    console.error('❌ 고립 데이터 정리 중 예외 발생:', err);
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

    // 1. Cloudflare R2 스토리지 대량 삭제 (무부하 초고속 처리)
    if (storagePaths.length > 0) {
      try {
        await deleteMultipleFromR2(storagePaths);
        totalFilesDeleted += storagePaths.length;
      } catch (storageError) {
        console.error('❌ Cloudflare R2 삭제 실패:', storageError);
      }
    }

    // 2. 관련 통계 데이터 삭제 (Cascade 역할)
    await supabase.from('match_stats_raw').delete().in('match_id', matchIds);
    await supabase.from('processed_match_telemetry').delete().in('match_id', matchIds);

    // 3. 메인 매치 데이터 삭제
    const { error: dbError } = await supabase
      .from('match_master_telemetry')
      .delete()
      .in('match_id', matchIds);

    if (!dbError) {
      totalMatchesDeleted += targets.length;
    }
    
    console.log(`⏳ 처리 중... (DB: ${totalMatchesDeleted}개 매치 및 관련 데이터 삭제됨)`);
  }

  // 4. 플레이어 자동완성 캐시 정리 (검색된 적이 없고 14일 이상 업데이트되지 않은 비활성 유저 캐시 소각)
  console.log('🧹 비활성 플레이어 자동완성 캐시 정리 중...');
  try {
    const playerCutoffDate = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
    const { count: deletedPlayersCount, error: playerCacheErr } = await supabase
      .from('pubg_player_cache')
      .delete({ count: 'exact' })
      .eq('search_count', 0)
      .lt('updated_at', playerCutoffDate.toISOString());

    if (playerCacheErr) {
      console.error('❌ 비활성 플레이어 캐시 삭제 실패:', playerCacheErr.message);
    } else {
      console.log(`✅ 비활성 플레이어 캐시 정리 완료 (${deletedPlayersCount || 0}개 유저 삭제됨)`);
    }
  } catch (err) {
    console.error('❌ 플레이어 캐시 정리 중 예외 발생:', err);
  }
  
  // 5. 벤치마크 데이터 정리 (filter_version 및 티어별 캡핑)
  console.log('📊 벤치마크 데이터 정리 중...');
  await supabase.from('global_benchmarks').delete().lt('filter_version', 8);

  const tiers = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];
  const MAX_SAMPLES_PER_TIER = 500;
  const tierCounts: Record<string, number> = {};
  let totalBenchmarksDeleted = 0;

  for (const tier of tiers) {
    const { data: samples } = await supabase
      .from('global_benchmarks')
      .select('id')
      .eq('tier', tier)
      .order('created_at', { ascending: false });

    let finalCount = 0;
    if (samples) {
      if (samples.length > MAX_SAMPLES_PER_TIER) {
        const toDelete = samples.slice(MAX_SAMPLES_PER_TIER).map(s => s.id);
        await supabase.from('global_benchmarks').delete().in('id', toDelete);
        finalCount = MAX_SAMPLES_PER_TIER;
        totalBenchmarksDeleted += toDelete.length;
      } else {
        finalCount = samples.length;
      }
    }
    tierCounts[tier] = finalCount;
  }
  const tierLogs = tiers.map(t => `${t}: ${tierCounts[t] || 0}개`).join(', ');
  console.log(`✅ 벤치마크 최신화 및 캡핑 완료 (티어별 최대 ${MAX_SAMPLES_PER_TIER}개, 총 ${totalBenchmarksDeleted}개 정리됨)`);
  console.log(`   - 분포: ${tierLogs}`);

  const bucketFiles = await listR2Files(1000);
  if (bucketFiles && bucketFiles.length > 0) {
    const { data: activeRecords } = await supabase.from('match_master_telemetry').select('storage_path');
    const activePaths = new Set(activeRecords?.map(r => r.storage_path) || []);
    const orphanedFiles = bucketFiles
      .map(f => f.key)
      .filter(name => {
        // crates/ 및 weapons/ 하위의 서비스 영구 자산들은 고립 파일 정리에서 제외
        if (name.startsWith('crates/') || name.startsWith('weapons/')) {
          return false;
        }
        return !activePaths.has(name);
      });

    if (orphanedFiles.length > 0) {
      try {
        await deleteMultipleFromR2(orphanedFiles);
        totalFilesDeleted += orphanedFiles.length;
      } catch (orphanError) {
        console.error('❌ Cloudflare R2 고립 파일 삭제 실패:', orphanError);
      }
    }
  }

  // 5. 최종 통계 및 용량 확인
  console.log('\n📊 [최종 작업 통계]');
  const { data: finalMatches } = await supabase.from('match_master_telemetry').select('count', { count: 'exact' });
  
  // 용량 합산 로직 (페이지네이션)
  let totalSizeBytes = 0;
  let totalFileCount = 0;
  
  const remainingFiles = await listR2Files(1000);
  remainingFiles.forEach(f => {
    totalSizeBytes += f.size;
    totalFileCount++;
  });

  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  console.log(`──────────────────────────────────────`);
  console.log(`🗑️  삭제된 데이터: DB ${totalMatchesDeleted}개 매치 / Storage ${totalFilesDeleted}개`);
  console.log(`📉 남은 데이터: DB ${finalMatches?.[0]?.count || 0}개 / Storage ${totalFileCount}개`);
  console.log(`💾 현재 스토리지 사용량: ${totalSizeMB} MB (${totalSizeGB} GB)`);
  console.log(`──────────────────────────────────────`);
  console.log(`✨ 모든 작업이 완료되었습니다.`);
}

smartCleanup().catch(console.error);
