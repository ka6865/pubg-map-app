// scripts/sync_weapons_to_r2.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import sharp from 'sharp';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// .env.local 환경 변수 강제 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Supabase Credentials are missing in .env.local!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// R2 S3 클라이언트 세팅
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
});

const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'bgms';

// 1. 무기 매핑 테이블 (DB id ➡️ 펍지 공식 api-assets 원시 ID)
const WEAPON_MAP: Record<string, string> = {
  "dmr_mini14": "Item_Weapon_Mini14_C",
  "dmr_mk12": "Item_Weapon_Mk12_C",
  "dmr_vss": "Item_Weapon_VSS_C",
  "dmr_mk14": "Item_Weapon_Mk14_C",
  "sg_dbs": "Item_Weapon_DP12_C",
  "smg_tommy": "Item_Weapon_Thompson_C",
  "ar_ace32": "Item_Weapon_ACE32_C",
  "ar_akm": "Item_Weapon_AK47_C",
  "ar_aug": "Item_Weapon_AUG_C",
  "sr_awm": "Item_Weapon_AWM_C",
  "lmg_dp28": "Item_Weapon_DP28_C",
  "sg_s1897": "Item_Weapon_Winchester_C",
  "ar_famas": "Item_Weapon_FAMASG2_C",
  "ar_g36c": "Item_Weapon_G36C_C",
  "smg_js9": "Item_Weapon_JS9_C",
  "ar_k2": "Item_Weapon_K2_C",
  "sr_kar98k": "Item_Weapon_Kar98k_C",
  "ar_m16a4": "Item_Weapon_M16A4_C",
  "sr_m24": "Item_Weapon_M24_C",
  "lmg_m249": "Item_Weapon_M249_C",
  "ar_m416": "Item_Weapon_HK416_C",
  "lmg_mg3": "Item_Weapon_MG3_C",
  "ar_mk47": "Item_Weapon_Mk47Mutant_C",
  "smg_mp9": "Item_Weapon_MP9_C",
  "smg_mp5k": "Item_Weapon_MP5K_C",
  "sg_s686": "Item_Weapon_Berreta686_C",
  "sg_o12": "Item_Weapon_OriginS12_C",
  "smg_bizon": "Item_Weapon_BizonPP19_C",
  "smg_p90": "Item_Weapon_P90_C",
  "dmr_qbu": "Item_Weapon_QBU88_C",
  "ar_qbz": "Item_Weapon_QBZ95_C",
  "sg_s12k": "Item_Weapon_Saiga12_C",
  "ar_scarl": "Item_Weapon_SCAR-L_C",
  "dmr_slr": "Item_Weapon_FNFal_C",
  "dmr_sks": "Item_Weapon_SKS_C",
  "smg_ump": "Item_Weapon_UMP_C",
  "sr_win94": "Item_Weapon_Win1894_C",
  "ar_groza": "Item_Weapon_Groza_C",
  "sr_lynx": "Item_Weapon_L6_C",
  "smg_uzi": "Item_Weapon_UZI_C",
  "sr_mosin": "Item_Weapon_Mosin_C",
  "ar_beryl": "Item_Weapon_BerylM762_C",
  "smg_vector": "Item_Weapon_Vector_C",
  "dmr_dragunov": "Item_Weapon_Dragunov_C",
  "박격포": "Item_Weapon_Mortar_C",
  "folded_shield": "Item_BulletproofShield_C"
};

// 2. 파츠 매핑 테이블 (R2 저장 key ➡️ 펍지 공식 api-assets 원시 ID)
const ATTACHMENT_MAP: Record<string, string> = {
  "vertical_grip": "Item_Attach_Weapon_Lower_Foregrip_C",
  "angled_grip": "Item_Attach_Weapon_Lower_AngledForeGrip_C",
  "half_grip": "Item_Attach_Weapon_Lower_HalfGrip_C",
  "thumb_grip": "Item_Attach_Weapon_Lower_ThumbGrip_C",
  "light_grip": "Item_Attach_Weapon_Lower_LightweightForeGrip_C",
  "ar_compensator": "Item_Attach_Weapon_Muzzle_Compensator_Large_C",
  "ar_suppressor": "Item_Attach_Weapon_Muzzle_Suppressor_Large_C",
  "ar_flashhider": "Item_Attach_Weapon_Muzzle_FlashHider_Large_C",
  "ar_eqd_magazine": "Item_Attach_Weapon_Magazine_ExtendedQuickDraw_Large_C",
  "scope_3x": "Item_Attach_Weapon_Upper_Scope3x_C",
  "scope_4x": "Item_Attach_Weapon_Upper_ACOG_01_C",
  "scope_6x": "Item_Attach_Weapon_Upper_Scope6x_C"
};

// 3. 41.2 패치 버전 기준 DB 무기 기본 스탯 보정치 정의
const PATCH_412_WEAPON_STATS: Record<string, { damage: number; bullet_speed?: number }> = {
  "ar_m416": { damage: 41 },      // 40 ➡️ 41
  "ar_beryl": { damage: 46 },     // 44 ➡️ 46
  "dmr_mk12": { damage: 51 },     // 50 ➡️ 51
  "dmr_mini14": { damage: 48 },   // 48 (일치여부 확인)
  "sr_awm": { damage: 105 }       // 105 (일치여부 확인)
};

// R2 업로드 헬퍼
async function uploadToR2(key: string, buffer: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  });
  await r2Client.send(command);
}

// 로컬 스크랩 디렉토리 Fallback 헬퍼
async function getFallbackLocalBuffer(pubgId: string): Promise<Buffer | null> {
  const nameMap: Record<string, string> = {
    "Item_Weapon_HK416_C": "M416",
    "Item_Weapon_BerylM762_C": "BerylM762",
    "Item_Weapon_DBS_C": "DBS",
    "Item_Weapon_S1897_C": "S1897",
    "Item_Weapon_JS9_C": "JS9",
    "Item_Weapon_Thompson_C": "TommyGun",
    "Item_Weapon_UZI_C": "MicroUZI",
    "Item_Weapon_SCAR-L_C": "SCAR-L",
    "Item_Weapon_FNFal_C": "SLR"
  };

  const baseName = nameMap[pubgId] || pubgId.replace("Item_Weapon_", "").replace("_C", "");
  const localPath = path.resolve(process.cwd(), 'scratch/pubg_plus_assets/weapon', `${baseName}.png`);
  
  try {
    const buffer = await fs.readFile(localPath);
    return buffer;
  } catch {
    return null;
  }
}

// 이미지 다운로드, WebP 최적화 및 R2 업로드 연쇄 파이프라인
async function syncImageToR2(pubgId: string, destKey: string, isAttachment = false) {
  // 파츠는 Attachment/ 하위, 무기는 Weapon/Main/ 하위에 위치함
  const folderPath = isAttachment ? "Assets/Item/Attachment" : "Assets/Item/Weapon/Main";
  const url = `https://raw.githubusercontent.com/pubg/api-assets/master/${folderPath}/${pubgId}.png`;
  
  try {
    let rawData: Buffer;
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      rawData = Buffer.from(res.data);
    } catch (err: any) {
      // 404 등 다운로드 실패 시, 무기 아이템이면 로컬 스크랩 디렉토리에서 Fallback 시도
      if (!isAttachment) {
        console.log(`[TRY FALLBACK] ${pubgId} not found in github. Trying local scrap folder...`);
        const fallbackBuffer = await getFallbackLocalBuffer(pubgId);
        if (fallbackBuffer) {
          rawData = fallbackBuffer;
          console.log(`[FALLBACK FOUND] Loaded ${pubgId} from local scratch folder.`);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
    
    // sharp를 이용해 WebP 512px 최대 너비로 압축 (용량 99% 최적화)
    const webpBuffer = await sharp(rawData)
      .resize(512, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
      
    await uploadToR2(destKey, webpBuffer, "image/webp");
    console.log(`[SYNC SUCCESS] ${pubgId} ➡️ R2:${destKey} (WebP Cached)`);
    return true;
  } catch (err: any) {
    console.error(`[SYNC FAILED] ${pubgId} ➡️ R2:${destKey} (Error: ${err.response?.status || err.message})`);
    return false;
  }
}

async function run() {
  console.log("====================================================");
  console.log("   PUBG Weapon & Attachment R2 Sync & 41.2 Patch    ");
  console.log("====================================================");

  // 1. DB 무기 스탯 41.2 버전 보정
  console.log("\n[1] Updating Supabase Weapons Table to 41.2 Stats...");
  for (const [id, stats] of Object.entries(PATCH_412_WEAPON_STATS)) {
    const { error } = await supabase
      .from("weapons")
      .update({
        damage: stats.damage,
        ...(stats.bullet_speed ? { bullet_speed: stats.bullet_speed } : {})
      })
      .eq("id", id);
      
    if (error) {
      console.error(`❌ Failed to update DB stats for ${id}:`, error.message);
    } else {
      console.log(`✅ DB stats updated for ${id}: damage = ${stats.damage}`);
    }
  }

  // 2. 무기 이미지 다운로드 및 R2 캐싱
  console.log("\n[2] Synchronizing Weapon Images to R2...");
  let weaponSuccess = 0;
  for (const [dbId, pubgId] of Object.entries(WEAPON_MAP)) {
    const destKey = `weapons/${dbId}.webp`;
    const ok = await syncImageToR2(pubgId, destKey, false);
    if (ok) weaponSuccess++;
  }
  console.log(`- Weapon Sync Completed: ${weaponSuccess} / ${Object.keys(WEAPON_MAP).length} Succeeded.`);

  // 3. 파츠 이미지 다운로드 및 R2 캐싱
  console.log("\n[3] Synchronizing Attachment Images to R2...");
  let attachSuccess = 0;
  for (const [destId, pubgId] of Object.entries(ATTACHMENT_MAP)) {
    const destKey = `attachments/${destId}.webp`;
    const ok = await syncImageToR2(pubgId, destKey, true);
    if (ok) attachSuccess++;
  }
  console.log(`- Attachment Sync Completed: ${attachSuccess} / ${Object.keys(ATTACHMENT_MAP).length} Succeeded.`);

  console.log("\n🎉 All Sync Tasks Completed Successfully!");
}

run().catch(err => {
  console.error("Critical error in sync pipeline:", err);
  process.exit(1);
});
