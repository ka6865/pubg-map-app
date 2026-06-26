const SUPABASE_PUBLIC_IMAGES_MARKER = "/storage/v1/object/public/images/";
const BOARD_IMAGE_PROXY_PREFIX = "/api/board/images/";

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function extractSupabaseImagePath(src: string | null | undefined): string | null {
  const value = String(src || "").trim();
  if (!value) return null;

  const publicIndex = value.indexOf(SUPABASE_PUBLIC_IMAGES_MARKER);
  if (publicIndex >= 0) {
    const path = value.slice(publicIndex + SUPABASE_PUBLIC_IMAGES_MARKER.length).split(/[?#]/)[0];
    return path ? decodeURIComponent(path) : null;
  }

  const proxyIndex = value.indexOf(BOARD_IMAGE_PROXY_PREFIX);
  if (proxyIndex >= 0) {
    const path = value.slice(proxyIndex + BOARD_IMAGE_PROXY_PREFIX.length).split(/[?#]/)[0];
    return path ? decodeURIComponent(path) : null;
  }

  return null;
}

export function toBoardImageProxyUrl(src: string | null | undefined, baseUrl = ""): string {
  const path = extractSupabaseImagePath(src);
  if (!path) return String(src || "");

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}${BOARD_IMAGE_PROXY_PREFIX}${encodeStoragePath(path)}`;
}

export function rewriteBoardImageUrls(html: string): string {
  if (!html || !html.includes(SUPABASE_PUBLIC_IMAGES_MARKER)) return html;

  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const proxiedSrc = toBoardImageProxyUrl(src);
      return proxiedSrc === src ? match : `${prefix}${proxiedSrc}${suffix}`;
    }
  );
}
