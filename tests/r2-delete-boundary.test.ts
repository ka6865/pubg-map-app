import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = sendMock;
    },
  };
});

import { deleteMultipleFromR2 } from "../lib/pubg-analysis/r2Service";

describe("R2 batch delete boundary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLOUDFLARE_R2_ENDPOINT = "https://r2.example";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "test-access-key";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.CLOUDFLARE_R2_BUCKET_NAME = "test-bucket";
    sendMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("DeleteObjects 응답에 부분 실패가 있으면 고정 오류로 거부하고 원문을 로그하지 않는다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMock.mockResolvedValue({
      Errors: [{
        Key: "private/player-account-id.json",
        Code: "AccessDenied",
        Message: "credential detail",
      }],
    });

    await expect(deleteMultipleFromR2([
      "first.json",
      "second.json",
    ])).rejects.toThrow("r2-batch-delete-failed");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const serializedLogs = JSON.stringify(errorSpy.mock.calls);
    expect(serializedLogs).not.toContain("private/player-account-id.json");
    expect(serializedLogs).not.toContain("AccessDenied");
    expect(serializedLogs).not.toContain("credential detail");
  });

  it("DeleteObjects 응답에 부분 실패가 없으면 완료한다", async () => {
    sendMock.mockResolvedValue({ Errors: [] });

    await expect(deleteMultipleFromR2(["first.json"])).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
