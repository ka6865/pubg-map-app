import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import sharp from 'sharp';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/['";\s]+/g, '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').replace(/['";\s]+/g, '').trim();
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

async function checkAndRestoreImage(key: string) {
  const destKey = `crates/${key}.webp`;
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: R2_BUCKET,
      Key: destKey,
    });
    await r2Client.send(headCommand);
    console.log(`✅ [ALREADY EXISTS] ${destKey}`);
  } catch (err) {
    console.log(`❌ [MISSING] ${destKey} -> Syncing from CDN...`);
    const cdnUrl = `https://cdn.pubgitems.info/i-icons/${key}.png`;
    try {
      const res = await axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 5000 });
      const rawData = Buffer.from(res.data);
      const webpBuffer = await sharp(rawData)
        .resize(256, null, { withoutEnlargement: true }) // 화질 보장을 위해 256px로 상향
        .webp({ quality: 85 })
        .toBuffer();

      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: destKey,
        Body: webpBuffer,
        ContentType: 'image/webp',
      });
      await r2Client.send(putCommand);
      console.log(`✅ [RESTORED SUCCESS] ${key}.webp`);
    } catch (restoreErr: any) {
      console.error(`❌ [RESTORE FAILED] ${key} CDN error: ${restoreErr.message}`);
    }
  }
}

async function run() {
  try {
    console.log("Fetching asset keys from DB...");
    
    // 1. crate_item_assets에서 asset_key 목록 수집
    const { data: assets, error: assetsError } = await supabase
      .from("crate_item_assets")
      .select("asset_key");
    if (assetsError) throw assetsError;

    // 2. crate_templates에서 asset_key 목록 수집
    const { data: templates, error: templatesError } = await supabase
      .from("crate_templates")
      .select("asset_key");
    if (templatesError) throw templatesError;

    // 고유한 숫자형 키(ID) 모으기
    const keysSet = new Set<string>();
    
    (assets || []).forEach(a => {
      if (a.asset_key && /^\d+$/.test(a.asset_key)) {
        keysSet.add(a.asset_key);
      }
    });

    (templates || []).forEach(t => {
      if (t.asset_key && /^\d+$/.test(t.asset_key)) {
        keysSet.add(t.asset_key);
      }
    });

    const keysToSync = Array.from(keysSet);
    console.log(`Found ${keysToSync.length} numeric keys to verify in R2.`);

    // 동시 요청 속도를 제어하며 순차 실행 (R2 Rate Limit 및 CDN 과부하 방지)
    for (const key of keysToSync) {
      await checkAndRestoreImage(key);
    }

    console.log("\n🎉 All missing assets synchronized with R2 successfully!");

  } catch (err) {
    console.error("Critical error in sync process:", err);
  }
}

run();
