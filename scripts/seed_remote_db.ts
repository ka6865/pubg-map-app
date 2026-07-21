import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/['";\s]+/g, '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/['";\s]+/g, '').trim();

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE credentials in .env.local!");
  process.exit(1);
}

// Create admin supabase client with service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});

const imaginationCrateId = 'c7a312f1-9b4f-4a32-9c12-32a2223a4b01';
const glasyaCrateId = 'c7a312f1-9b4f-4a32-9c12-32a2223a4b02';

interface CrateItemRaw {
  id: string | null; // numeric asset_key
  name: string;
  rarity: string;
  prob: number;
  existingKey?: string;
  tokenCount?: number;
}

const imaginationItems: CrateItemRaw[] = [
  { id: '12014049', name: '상상력 풀가동 - SLR (네이비 레드)', rarity: 'ULTIMATE', prob: 0.004000 },
  { id: '12012046', name: '상상력 풀가동 - SLR', rarity: 'LEGENDARY', prob: 0.009000 },
  { id: '12011101', name: '진열용 - ACE32', rarity: 'EPIC', prob: 0.015000 },
  { id: '12011056', name: '네온 드림 - 미니14', rarity: 'EPIC', prob: 0.008000 },
  { id: '12011070', name: '스틸 더 쇼 - 베릴 M762', rarity: 'EPIC', prob: 0.008000 },
  { id: '12011071', name: '스틸 더 쇼 - SKS', rarity: 'EPIC', prob: 0.008000 },
  { id: '12015113', name: '진열용 - 드라구노프', rarity: 'ELITE', prob: 0.030000 },
  { id: '12015114', name: '진열용 - 판처파우스트', rarity: 'ELITE', prob: 0.030000 },
  
  // ELITE (1.4% each)
  { id: '12010705', name: '갤럭시 암즈 - AKM', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010706', name: '갤럭시 암즈 - SKS', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010707', name: '갤럭시 암즈 - MP9', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010894', name: '파인 아트 - 토미 건', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010005', name: '트라이펙타 - SCAR-L', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010927', name: '크리스마스 트리 - P18C', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010537', name: '야생화 - 석궁', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010538', name: '야생화 - 그로자', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010539', name: '야생화 - 베릴 M762', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010548', name: '플라워 파워 - AKM', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010549', name: '플라워 파워 - AWM', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010550', name: '플라워 파워 - 벡터', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010023', name: '골드 - SKS', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010046', name: '골드 - 그로자', rarity: 'ELITE', prob: 0.014000 },
  { id: '12010051', name: '골드 - AWM', rarity: 'ELITE', prob: 0.014000 },
  
  // RARE (1.89% each)
  { id: '12010708', name: '프랙탈 스플래시 - Mk47 뮤턴트', rarity: 'RARE', prob: 0.018900 },
  { id: '12010709', name: '프랙탈 스플래시 - VSS', rarity: 'RARE', prob: 0.018900 },
  { id: '12010710', name: '프랙탈 스플래시 - ACE32', rarity: 'RARE', prob: 0.018900 },
  { id: '12010540', name: '스키드 마크 - M249', rarity: 'RARE', prob: 0.018900 },
  { id: '12010684', name: '스노우 플레이크 - K2', rarity: 'RARE', prob: 0.018900 },
  { id: '12010542', name: '스키드 마크 - VSS', rarity: 'RARE', prob: 0.018900 },
  { id: '12010217', name: '골드 - 벡터', rarity: 'RARE', prob: 0.018900 },
  { id: '12010218', name: '골드 - UMP', rarity: 'RARE', prob: 0.018900 },
  { id: '12010021', name: '골드 - 소드오프', rarity: 'RARE', prob: 0.018900 },

  // SPECIAL (2.28% each)
  { id: '12010711', name: '제로 아워 - P18C', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010713', name: '제로 아워 - UMP', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010775', name: '마린 매트 (파란색) - VSS', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010776', name: '마린 매트 (파란색) - S686', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010714', name: '폴카 데스 - M16A4', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010715', name: '폴카 데스 - K2', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010717', name: '폴카 데스 - S12K', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010529', name: '정글 프라울러 - G36C', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010530', name: '정글 프라울러 - P92', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010531', name: '정글 프라울러 - 소드오프', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010691', name: '파스텔 파워 - R1895', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010533', name: '사파리 스트라이프 - S12K', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010534', name: '사파리 스트라이프 - M16A4', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010535', name: '사파리 스트라이프 - UMP', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010030', name: '러기드 (주황색) - SCAR-L', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010034', name: '러기드 (주황색) - M416', rarity: 'SPECIAL', prob: 0.022800 },
  { id: '12010028', name: '골드 - Win94', rarity: 'SPECIAL', prob: 0.022800 },

  // Schematic / Polymers (Reuse existing assets)
  { id: null, name: '도면 (Schematic)', rarity: 'LEGENDARY', prob: 0.009000, existingKey: 'schematic' },
  { id: null, name: '폴리머 (Polymer) x200', rarity: 'SPECIAL', prob: 0.010000, existingKey: 'polymer', tokenCount: 200 },
  { id: null, name: '폴리머 (Polymer) x100', rarity: 'SPECIAL', prob: 0.025000, existingKey: 'polymer', tokenCount: 100 },
  { id: null, name: '폴리머 (Polymer) x50', rarity: 'SPECIAL', prob: 0.076300, existingKey: 'polymer', tokenCount: 50 }
];

const glasyaItems: CrateItemRaw[] = [
  // Legendary (도안)
  { id: '17000004', name: '글라시아 도안', rarity: 'LEGENDARY', prob: 0.010000 },
  { id: '17000001', name: '한나 도안', rarity: 'LEGENDARY', prob: 0.002500 },
  { id: '17000002', name: '도리언 도안', rarity: 'LEGENDARY', prob: 0.002500 },

  // Epic (도안)
  { id: '13001597', name: '트러블메이커 헬멧 세트 도안', rarity: 'EPIC', prob: 0.004000 },
  { id: '13001598', name: '관짝 배낭 세트 도안', rarity: 'EPIC', prob: 0.004000 },
  { id: '12030124', name: '프리랜서 퇴마사 낙하산 도안', rarity: 'EPIC', prob: 0.004000 },
  { id: '12015118', name: '결단의 순간 - 프라이팬 도안', rarity: 'EPIC', prob: 0.004500 },
  { id: '12015121', name: '결단의 순간 - S1897 도안', rarity: 'EPIC', prob: 0.004500 },
  { id: '12015123', name: '최후의 심판 해머 (골드) 도안', rarity: 'EPIC', prob: 0.004500 },
  { id: '18010109', name: '은빛 인장 도안', rarity: 'EPIC', prob: 0.004500 },
  { id: '13000689', name: '웨이스티드 퓨처 세트 도안', rarity: 'EPIC', prob: 0.005000 },
  { id: '13000611', name: '아포칼립스 세트 도안', rarity: 'EPIC', prob: 0.005000 },
  { id: '13000828', name: '웨이스트랜드 원더러 세트 도안', rarity: 'EPIC', prob: 0.005000 },
  { id: '13000829', name: '오션 노마드 세트 도안', rarity: 'EPIC', prob: 0.005000 },

  // Elite (30 items, 0.008750 each)
  { id: '13000875', name: '테크노 레이브 버니 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000876', name: '버니 밴디트 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000877', name: '버니 공듀 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000878', name: '비밀요원 버니 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000889', name: '할로우 위치 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000890', name: '마녀 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000891', name: '저주받은 개 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000892', name: '저주받은 늑대인간 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000934', name: '블러드 헌터 세트 2 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000935', name: '블러드 헌터 세트 1 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000936', name: '가디언 엔젤 세트 2 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000937', name: '가디언 엔젤 세트 1 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000550', name: '필라 택티컬 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000552', name: '던컨의 헤이븐 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000556', name: '헤이븐 스트리트 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000357', name: '크루세이더 의상 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000358', name: '나이트 헌터 의상 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000359', name: '암흑의 백작 의상 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000360', name: '고통의 기사 의상 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '13000687', name: '도둑 고양이 세트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060089', name: '밀크방카 (검은색) 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060090', name: '밀크방카 (갈색) 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060091', name: '카우 보이 모자 (검은색) 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060092', name: '카우 보이 모자 (갈색) 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060096', name: '크리스마스 엘프 모자 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11060099', name: '고양이 귀 비니 (검은색) 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11010564', name: '가디언 엔젤 롱코트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11020407', name: '가디언 엔젤 반바지 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11020408', name: '블러드 헌터 스커트 도안', rarity: 'ELITE', prob: 0.008750 },
  { id: '11030379', name: '드래곤 마더 부츠 도안', rarity: 'ELITE', prob: 0.008750 },

  // Rare (20 items, 0.013000 each)
  { id: '11030380', name: '블러드 헌터 부츠 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11030381', name: '서펀트 퀸 스타킹 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11050295', name: '블러드 헌터 재킷 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11050296', name: '화이트 와이번 라이더 재킷 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11050297', name: '가디언 엔젤 재킷 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11050298', name: '블러드 헌터 롱코트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11060192', name: '블러드 헌터 모자 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11060193', name: '가디언 엔젤 모자 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000132', name: '엘 포소 홈 유니폼 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000140', name: '퍼그 라이프 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000155', name: 'PCS3 의상 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000553', name: '런치미트의 헤이븐 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000555', name: '헤이븐 펑크 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000557', name: '헤이븐 밴디트 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000223', name: '로어 스트리트웨어 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000224', name: '해저드 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000225', name: '컬러풀 카오스 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '13000226', name: '스트리트 비트 세트 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11010538', name: '스콜 스웨트셔츠 도안', rarity: 'RARE', prob: 0.013000 },
  { id: '11030358', name: '요르드의 땅 부츠 도안', rarity: 'RARE', prob: 0.013000 },

  // Special (14 items, 0.015000 each)
  { id: '11050271', name: '아스가르드 빈티지 티셔츠 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11010547', name: '저주받은 개 티셔츠 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11020398', name: '저주받은 늑대인간 반바지 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11030372', name: '저주받은 늑대인간 장화 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '18040106', name: '살아있는 시체들의 밤 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '18100167', name: 'RIP 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '16100387', name: '승리 댄스 115 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '16100378', name: '동전 던지기 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11010149', name: 'GLL 그랜드 슬램 맨투맨 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11020060', name: 'GLL 그랜드 슬램 찢어진 청바지 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11020084', name: 'MET 아시아 시리즈 찢어진 청바지 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11050073', name: 'MET 아시아 시리즈 바머 재킷 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11010162', name: '사립학교 스웨터 (노란색) 도안', rarity: 'SPECIAL', prob: 0.015000 },
  { id: '11010163', name: '사립학교 스웨터 (회색) 도안', rarity: 'SPECIAL', prob: 0.015000 },

  // Credits (Reuse existing asset)
  { id: null, name: '크레딧 x1000', rarity: 'SPECIAL', prob: 0.056500, existingKey: 'credit', tokenCount: 1000 },
  { id: null, name: '크레딧 x2000', rarity: 'SPECIAL', prob: 0.030000, existingKey: 'credit', tokenCount: 2000 },
  { id: null, name: '크레딧 x3000', rarity: 'SPECIAL', prob: 0.016000, existingKey: 'credit', tokenCount: 3000 }
];

function normalizeName(str: string): string {
  return str
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/["'`]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

async function seed() {
  console.log("Starting remote database seed script...");

  // 1. Seed Crate Templates
  console.log("Upserting crate templates...");
  const { error: templateError } = await supabase
    .from('crate_templates')
    .upsert([
      {
        id: imaginationCrateId,
        name: '상상력 풀가동 밀수품 상자',
        type: 'contraband',
        price_gcoin: 200,
        bundle_price_gcoin: 1800,
        price_bp: 8000,
        price_bp_limit: 50,
        ticket_currency_code: 'contraband_coupon',
        ticket_price_single: 10,
        ticket_price_bundle: 100,
        bonus_currency_code: 'contraband_scrap',
        bonus_amount_single: 10,
        bonus_amount_bundle: 100,
        image_url: '/images/crates/imagination_crate.png',
        description: '상상력 풀가동 - SLR 성장형 무기 스킨을 획득할 수 있는 밀수품 상자입니다.',
        active: true
      },
      {
        id: glasyaCrateId,
        name: '글라시아 화물 상자',
        type: 'loot_crate',
        price_gcoin: 0,
        bundle_price_gcoin: 0,
        price_bp: null,
        price_bp_limit: null,
        ticket_currency_code: 'artisan_token',
        ticket_price_single: 1,
        ticket_price_bundle: null,
        bonus_currency_code: null,
        bonus_amount_single: null,
        bonus_amount_bundle: null,
        image_url: '/images/crates/glasya_cargo.png',
        description: '제작소 장인 제작 탭에서 장인 토큰으로 개봉 가능한 글라시아 화물 상자입니다.',
        active: true
      }
    ]);

  if (templateError) {
    console.error("Error seeding crate templates:", templateError);
    process.exit(1);
  }
  console.log("✓ Crate templates upserted successfully.");

  // 2. Upsert New Assets into crate_item_assets
  console.log("Upserting new assets into crate_item_assets...");
  const assetsToInsert: any[] = [];
  const allItems = [...imaginationItems, ...glasyaItems];

  allItems.forEach(item => {
    if (item.existingKey) return; // Skip polymer, schematic, credit
    const normalized = normalizeName(item.name);
    assetsToInsert.push({
      asset_key: item.id!,
      display_name: item.name,
      normalized_name: normalized,
      r2_key: `crates/${item.id}.webp`,
      image_url: `/api/images/crates/${item.id}.webp`,
      rarity: item.rarity
    });
  });

  const { error: assetError } = await supabase
    .from('crate_item_assets')
    .upsert(assetsToInsert, { onConflict: 'asset_key' });

  if (assetError) {
    console.error("Error seeding assets:", assetError);
    process.exit(1);
  }
  console.log(`✓ Upserted ${assetsToInsert.length} new item assets.`);

  // 3. Fetch All Assets map (asset_key -> id)
  console.log("Fetching all assets mapping...");
  const { data: assetData, error: fetchError } = await supabase
    .from('crate_item_assets')
    .select('id, asset_key');

  if (fetchError || !assetData) {
    console.error("Error fetching assets mapping:", fetchError);
    process.exit(1);
  }

  const assetMap = new Map<string, string>();
  assetData.forEach((a: any) => {
    assetMap.set(a.asset_key, a.id);
  });
  console.log(`✓ Mapping loaded for ${assetMap.size} assets.`);

  // 4. Delete old crate_items for these templates to refresh mapping cleanly
  console.log("Cleaning up old relationships...");
  const { error: deleteError } = await supabase
    .from('crate_items')
    .delete()
    .in('crate_template_id', [imaginationCrateId, glasyaCrateId]);

  if (deleteError) {
    console.error("Error cleaning old items:", deleteError);
    process.exit(1);
  }
  console.log("✓ Old relationships cleared.");

  // 5. Insert new Crate Items
  console.log("Inserting new crate items with probability map...");
  const itemsToInsert: any[] = [];

  const addCrateItems = (crateId: string, list: CrateItemRaw[]) => {
    list.forEach(item => {
      let assetId: string | undefined;
      let imageUrl: string = '';

      if (item.existingKey) {
        assetId = assetMap.get(item.existingKey);
        // Find existing image_url from map if needed or leave empty (DB can handle it, or we can look it up)
      } else {
        assetId = assetMap.get(item.id!);
        imageUrl = `/api/images/crates/${item.id}.webp`;
      }

      if (!assetId) {
        console.error(`ERROR: Could not find asset_id for key: ${item.existingKey || item.id} (Item name: ${item.name})`);
        process.exit(1);
      }

      itemsToInsert.push({
        crate_template_id: crateId,
        name: item.name,
        rarity: item.rarity,
        probability: item.prob,
        image_url: imageUrl || null,
        token_count: item.tokenCount || 0,
        asset_id: assetId
      });
    });
  };

  addCrateItems(imaginationCrateId, imaginationItems);
  addCrateItems(glasyaCrateId, glasyaItems);

  const { error: itemsError } = await supabase
    .from('crate_items')
    .insert(itemsToInsert);

  if (itemsError) {
    console.error("Error inserting crate items:", itemsError);
    process.exit(1);
  }
  console.log(`✓ Successfully seeded ${itemsToInsert.length} crate items.`);
  console.log("Remote database seeding completed successfully!");
}

seed();
