/**
 * Task #5333 — Guard the AI Assistant image pipeline (upload + serve) with
 * automated coverage so a regression can't silently break "send a photo to
 * Bowie" or make the AI stop "seeing" attached images.
 *
 * Covers:
 *  1. POST /api/ai/assistant/images
 *     - requires auth (401 without session)
 *     - accepts a valid image (png) → 200 { url }
 *     - rejects a non-image file (fileFilter) → 400
 *     - rejects an oversized file (>10MB limit) → 400
 *  2. GET /api/ai/assistant/images/:filename
 *     - requires auth (401 without session)
 *     - serves a valid, previously-uploaded filename with the right content-type
 *     - rejects a filename that fails the safe-filename regex (traversal/junk) → 400
 *     - returns 404 when the object doesn't exist in storage
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetUser, mockUploadBuffer, mockDownloadBuffer } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUploadBuffer: vi.fn(),
  mockDownloadBuffer: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getUser: mockGetUser,
  },
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: mockUploadBuffer,
  downloadBuffer: mockDownloadBuffer,
}));

// ---------------------------------------------------------------------------
// Import under test — after mocks
// ---------------------------------------------------------------------------

import imagesRouter from "../routes/ai-assistant-images";

// ---------------------------------------------------------------------------
// Test app builders
// ---------------------------------------------------------------------------

function buildApp(opts: { authenticated: boolean } = { authenticated: true }): express.Application {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request).session = (opts.authenticated ? { userId: "user-123" } : {}) as unknown as Request["session"];
    next();
  });
  app.use("/api", imagesRouter);
  return app;
}

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

// ---------------------------------------------------------------------------
// Suite 1 — POST /api/ai/assistant/images
// ---------------------------------------------------------------------------

describe("POST /api/ai/assistant/images", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUploadBuffer.mockReset();
    mockGetUser.mockResolvedValue({ id: "user-123", nickname: "Test" });
    mockUploadBuffer.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const app = buildApp({ authenticated: false });
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", PNG_1x1, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(401);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects a request with no session user found (session valid but user missing) with 401", async () => {
    mockGetUser.mockResolvedValue(undefined);
    const app = buildApp({ authenticated: true });
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", PNG_1x1, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(401);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("accepts a valid PNG image and returns { url }", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", PNG_1x1, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("url");
    expect(typeof res.body.url).toBe("string");
    expect(res.body.url).toMatch(/^\/api\/ai\/assistant\/images\/[A-Za-z0-9_-]+\.png$/);

    // Uploaded under the private, dedicated prefix — never a public/guessable path.
    expect(mockUploadBuffer).toHaveBeenCalledTimes(1);
    const [objectPath, buffer, contentType] = mockUploadBuffer.mock.calls[0];
    expect(objectPath).toMatch(/^private\/assistant-images\//);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(contentType).toBe("image/png");
  });

  it("rejects a non-image file (e.g. text/plain) with 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects a request with no file attached with 400", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/ai/assistant/images");

    expect(res.status).toBe(400);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects an oversized file (>10MB) with 400", async () => {
    const app = buildApp();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", oversized, { filename: "huge.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("returns 500 (not silently 200) when object storage upload fails", async () => {
    mockUploadBuffer.mockRejectedValue(new Error("storage down"));
    const app = buildApp();
    const res = await request(app)
      .post("/api/ai/assistant/images")
      .attach("image", PNG_1x1, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty("url");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — GET /api/ai/assistant/images/:filename
// ---------------------------------------------------------------------------

describe("GET /api/ai/assistant/images/:filename", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockDownloadBuffer.mockReset();
    mockGetUser.mockResolvedValue({ id: "user-123", nickname: "Test" });
  });

  it("rejects an unauthenticated request with 401", async () => {
    const app = buildApp({ authenticated: false });
    const res = await request(app).get("/api/ai/assistant/images/abc123.png");

    expect(res.status).toBe(401);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("serves a valid, previously-uploaded image with the correct content-type", async () => {
    mockDownloadBuffer.mockResolvedValue(PNG_1x1);
    const app = buildApp();
    const res = await request(app).get("/api/ai/assistant/images/abc123.png");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(mockDownloadBuffer).toHaveBeenCalledWith("private/assistant-images/abc123.png");
  });

  it("rejects a filename with path traversal characters with 400 (never touches storage)", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/ai/assistant/images/" + encodeURIComponent("../../etc/passwd.png"),
    );

    expect(res.status).toBe(400);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("rejects a filename with an unsupported extension with 400", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/ai/assistant/images/abc123.exe");

    expect(res.status).toBe(400);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 when the object doesn't exist in storage", async () => {
    mockDownloadBuffer.mockRejectedValue(new Error("not found"));
    const app = buildApp();
    const res = await request(app).get("/api/ai/assistant/images/missing.png");

    expect(res.status).toBe(404);
  });
});
