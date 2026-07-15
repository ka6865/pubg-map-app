import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  parseHotdropConfig,
  runHotdropCollection,
  type HotdropJobResult,
  type HotdropSupabaseAdapter,
} from "../lib/hotdrop/runHotdropCollection";

export interface HotdropScriptDependencies {
  createSupabase(
    url: string,
    serviceRoleKey: string,
  ): Parameters<typeof runHotdropCollection>[2]["supabase"];
  runJob: typeof runHotdropCollection;
  writeInfo(message: string): void;
  writeError(message: string): void;
}

function requireEnv(
  env: Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key}-missing`);
  return value;
}

export async function runHotdropScript(
  env: Record<string, string | undefined>,
  dependencies: HotdropScriptDependencies,
): Promise<number> {
  try {
    const apiKey = requireEnv(env, "PUBG_API_KEY").split(" ")[0];
    const supabaseUrl = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
    const config = parseHotdropConfig(env);
    const supabase = dependencies.createSupabase(supabaseUrl, serviceRoleKey);
    const result: HotdropJobResult = await dependencies.runJob(apiKey, config, {
      fetchFn: fetch,
      supabase,
      sleep: (milliseconds) => new Promise((resolveSleep) => {
        setTimeout(resolveSleep, milliseconds);
      }),
      now: () => new Date().toISOString(),
    });
    dependencies.writeInfo(JSON.stringify(result));
    return 0;
  } catch {
    dependencies.writeError("Hotdrop 수집 작업이 실패했습니다.");
    return 1;
  }
}

const isDirectRun = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  void runHotdropScript(process.env, {
    createSupabase: (url, serviceRoleKey) => (
      createClient(url, serviceRoleKey) as unknown as HotdropSupabaseAdapter
    ),
    runJob: runHotdropCollection,
    writeInfo: (message) => console.info(message),
    writeError: (message) => console.error(message),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
