import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

it("공개 hotdrop route와 Vercel Cron을 제공하지 않는다", () => {
  expect(existsSync(resolve("app/api/cron/hotdrop/route.ts"))).toBe(false);
  expect(existsSync(resolve("vercel.json"))).toBe(false);
});

it("GitHub Actions만 hotdrop script를 한 번 실행한다", () => {
  const workflow = readFileSync(resolve(".github/workflows/daily-tasks.yml"), "utf8");
  expect(workflow.match(/npx tsx scripts\/run_hotdrop\.ts/g)).toHaveLength(1);
  expect(workflow).toContain("PUBG_API_KEY: ${{ secrets.PUBG_API_KEY }}");
  expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}");
  expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
});

it("작업 모듈의 제품 consumer는 실행 script 하나뿐이다", () => {
  const productFiles = [
    ...collectTypeScriptFiles(resolve("app")),
    ...collectTypeScriptFiles(resolve("lib")),
    ...collectTypeScriptFiles(resolve("scripts")),
  ];
  const consumers = productFiles.filter((file) => (
    file !== resolve("lib/hotdrop/runHotdropCollection.ts")
      && readFileSync(file, "utf8").includes("runHotdropCollection")
  ));
  expect(consumers).toEqual([resolve("scripts/run_hotdrop.ts")]);
});
