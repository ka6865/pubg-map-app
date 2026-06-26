import { NextResponse } from "next/server";

const ONE_YEAR_SECONDS = 31536000;

function cleanEnv(value: string | undefined) {
  return (value || "").replace(/['";\s]+/g, "").trim();
}

function normalizePath(path: string[] | undefined) {
  const rawSegments = path || [];
  const safeSegments = rawSegments
    .map((segment) => decodeURIComponent(segment).trim())
    .filter((segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\\"));

  if (safeSegments.length === 0 || safeSegments.length !== rawSegments.length) {
    return null;
  }

  return safeSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const storagePath = normalizePath(path);
  const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!storagePath || !supabaseUrl) {
    return new NextResponse("Image not found", { status: 404 });
  }

  const originUrl = `${supabaseUrl}/storage/v1/object/public/images/${storagePath}`;
  const originResponse = await fetch(originUrl, {
    headers: {
      Accept: request.headers.get("accept") || "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!originResponse.ok || !originResponse.body) {
    return new NextResponse("Image not found", { status: originResponse.status === 404 ? 404 : 502 });
  }

  const contentType = originResponse.headers.get("content-type") || "application/octet-stream";
  const cacheControl = `public, max-age=${ONE_YEAR_SECONDS}, s-maxage=${ONE_YEAR_SECONDS}, immutable`;

  return new NextResponse(originResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "CDN-Cache-Control": cacheControl,
      "Vercel-CDN-Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
