#!/bin/bash

# PUBG Map App - Capacitor 전용 빌드 스크립트
# 이 스크립트는 정적 내보내기를 위해 일시적으로 설정을 변경하고 빌드 후 복구합니다.

echo "🚀 [App Build] 앱 전용 정적 빌드를 시작합니다..."

# 1. 메인 페이지를 완전 정제된 정적 버전으로 교체
echo "📝 [App Build] 메인 페이지를 정적 추출용 임시 파일로 교체합니다..."
# 원래 파일 백업
cp app/page.tsx app/page.tsx.bak

# 임시 정적 페이지 생성
cat <<EOF > app/page.tsx
import HomeClient from './HomeClient';
export const dynamic = 'force-static';

export default function Page() {
  return <HomeClient jsonLd={[]} />;
}
EOF

# 2. API 폴더 격리 (Next.js 빌드 시 충돌 방지)
if [ -d "app/api" ]; then
    echo "📦 [App Build] API 폴더를 임시 격리합니다 (app/api -> app/_api)..."
    mv app/api app/_api
fi

# 3. Next.js 정적 빌드 실행
echo "🏗️ [App Build] Next.js 정적 빌드 실행 중..."
BUILD_MODE=export npm run build

# 4. 결과 확인
if [ -f "out/index.html" ]; then
    echo "✨ [App Build] 앱 빌드 완료! 'out/index.html'이 생성되었습니다."
else
    echo "❌ [App Build] 빌드 실패: 'out/index.html'이 생성되지 않았습니다."
    # 복구 로직 실행 후 종료
    mv app/page.tsx.bak app/page.tsx
    if [ -d "app/_api" ]; then
        mv app/_api app/api
    fi
    exit 1
fi

# 5. 복구 작업
echo "✅ [App Build] API 폴더를 원래 위치로 복원합니다 (app/_api -> app/api)..."
if [ -d "app/_api" ]; then
    mv app/_api app/api
fi

echo "✅ [App Build] 메인 페이지를 원래 상태로 복원합니다..."
if [ -f "app/page.tsx.bak" ]; then
    mv app/page.tsx.bak app/page.tsx
fi

echo "✨ [App Build] 모든 빌드 및 복구 작업이 성공적으로 완료되었습니다."
