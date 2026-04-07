/**
 * API 호출 시 환경에 따라 기본 주소를 선택합니다.
 * - 브라우저 웹(`isWeb`): `/api` (상대 경로)
 * - 네이티브 앱(`isApp`): `https://bgms.kr/api` (절대 경로)
 */

const isApp = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
const BASE_URL = isApp ? "https://bgms.kr" : "";

export const getApiUrl = (path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${BASE_URL}${cleanPath}`;
};

export default getApiUrl;
