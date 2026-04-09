# 🗺️ BGMS (PUBG Interactive Tactical Map & AI Intelligence)

**BGMS**는 배틀그라운드(PUBG) 게이머를 위한 차세대 전술 지도 및 AI 분석 플랫폼입니다. 단순한 지도 정보를 넘어, 텔레메트리 기반의 교전 리플레이 시각화와 Google Gemini를 활용한 AI 전략 브리핑을 제공합니다.

---

## ✨ 핵심 기능 (Key Features)

- **인터랙티브 전술 지도**: Leaflet 기반 고해상도 지도 및 7개 공식 맵(에란겔, 미라마, 태이고 등) 지원.
- **텔레메트리 리플레이**: 인게임 매치 데이터를 파싱하여 이동 경로, 교전 위치, 사망 지점 등을 지도에 투사.
- **BGMS AI 브리핑**: Google Gemini AI를 활용한 패치노트 자동 요약 및 플레이어 매치 분석 스타일 보고서 생성.
- **자동화 엔진 (Cron)**: 정기적인 공홈 뉴스 스크래핑 및 AI 요약 게시글 자동 등록 시스템.
- **모바일 하이브리드**: Capacitor를 통해 웹의 경험을 그대로 iOS/Android 앱으로 제공.
- **커뮤니티**: Discord 연동 기능이 포함된 실시간 정보 공유 및 게시판 시스템.

---

## 🛠️ 기술 스택 (Tech Stack)

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Library**: React 19, React-Leaflet, Lucide React
- **Styling**: Tailwind CSS v4, CSS Modules

### Backend & Data
- **Database / Auth**: Supabase (PostgreSQL)
- **AI**: Google Generative AI (Gemini)
- **Infra**: Vercel (Deployment), GitHub Actions (Cron Jobs)

### Mobile & Tools
- **Mobile**: Capacitor v8 (Hybrid)
- **State Management**: React 19 Hooks & Server Actions
- **Testing**: Jest, React Testing Library

---

## 🚀 시작하기 (Quick Start)

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 모바일 빌드 (Static Export)
npm run build:app
```

---

## 📖 프로젝트 가이드

AI 개발 가이드 및 상세 아키텍처는 [.project_context.md](./.project_context.md) 파일을 참조하십시오.