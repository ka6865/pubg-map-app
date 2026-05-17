import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.resolve(process.cwd(), "public/bluezone_data_v2.json");

function checkDataVersion() {
  if (!fs.existsSync(STORAGE_PATH)) {
    console.log("❌ 데이터 파일이 존재하지 않습니다.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
  const total = data.length;
  
  let v1Count = 0;
  let v2Count = 0;

  data.forEach((match: any) => {
    if (match.v === 2) v2Count++;
    else v1Count++;
  });

  console.log(`📊 [자기장 데이터 버전 통계]`);
  console.log(`- 전체 매치: ${total}건`);
  console.log(`- 구버전 (v1/고도기반): ${v1Count}건`);
  console.log(`- 신버전 (v2/isGame기반): ${v2Count}건`);
  
  if (v2Count > 0) {
    const latestV2 = data.filter((m: any) => m.v === 2).pop();
    console.log(`\n✨ 최신 v2 데이터 샘플 (MatchID: ${latestV2.matchId})`);
    console.log(`- 추출일시: ${latestV2.extractedAt}`);
  }
}

checkDataVersion();
