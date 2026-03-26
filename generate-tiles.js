const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const MAP_NAME = "Erangel";
const INPUT_FILE = `./public/${MAP_NAME}.jpg`;
const OUTPUT_DIR = `./public/tiles/${MAP_NAME}`;

const TILE_SIZE = 256;
const MAX_ZOOM = 5;

async function generateTiles() {
  console.log(`🚀 [${MAP_NAME}] 8K 지도 타일 썰기 작업 시작...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ 원본 파일을 찾을 수 없습니다: ${INPUT_FILE}`);
    return;
  }

  for (let z = 0; z <= MAX_ZOOM; z++) {
    const MathPow = Math.pow(2, z);
    const imageSize = TILE_SIZE * MathPow;

    console.log(
      `\n⏳ Zoom Level ${z} 처리 중... (크기: ${imageSize}x${imageSize})`
    );

    const resizedImage = await sharp(INPUT_FILE)
      .resize(imageSize, imageSize, { fit: "fill" })
      .toBuffer();

    for (let x = 0; x < MathPow; x++) {
      const dirPath = path.join(OUTPUT_DIR, `${z}`, `${x}`);
      fs.mkdirSync(dirPath, { recursive: true });

      for (let y = 0; y < MathPow; y++) {
        // 🌟 [핵심 변경] Leaflet의 CRS.Simple 음수 Y축 좌표계에 맞추기 위해 파일명을 음수로 저장합니다!
        const leafletY = y - MathPow;
        const tilePath = path.join(dirPath, `${leafletY}.jpg`);

        await sharp(resizedImage)
          .extract({
            left: x * TILE_SIZE,
            top: y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
          })
          .jpeg({ quality: 80 })
          .toFile(tilePath);
      }
    }
    console.log(`✅ Zoom Level ${z} 완료! (총 ${MathPow * MathPow}개 조각)`);
  }

  console.log(
    `\n🎉 모든 타일 생성 완료! 이제 ${OUTPUT_DIR} 폴더를 확인해 보세요!`
  );
}

generateTiles();
