/**
 * Tests: wishlist photo routes (bucket-backed)
 *
 * Covers:
 *  - POST /api/wishlist/photos → oggetto nel bucket, URL corretto salvato nel DB
 *  - POST /api/wishlist/photos con immagine > 8 MB → 400
 *  - POST /api/wishlist/photos con limite 3 foto già raggiunto → 400
 *  - GET /api/wishlist/photos/:filename → 200 dal bucket
 *  - GET /api/wishlist/photos/:filename (non nel bucket) → 200 via fallback disco
 *  - GET /api/wishlist/photos/:filename (né bucket né disco) → 404
 *  - GET /api/wishlist/photos/:filename con path traversal → 400
 *  - DELETE /api/wishlist/photos/:photoId → oggetto rimosso dal bucket
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  uploadBuffer: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  downloadBuffer: vi.fn<[string], Promise<Buffer>>(),
  deleteObject: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  BUCKET_WISHLIST: "Wishlist/",

  getUser: vi.fn(),
  getWishlist: vi.fn(),
  createOrUpdateWishlist: vi.fn(),
  getWishlistPhotos: vi.fn().mockResolvedValue([]),
  getWishlistMotos: vi.fn().mockResolvedValue([]),
  getWishlistPhotoCount: vi.fn(),
  addWishlistPhoto: vi.fn(),
  getWishlistPhoto: vi.fn(),
  deleteWishlistPhoto: vi.fn().mockResolvedValue(undefined),

  compressToWebP: vi.fn<[Buffer], Promise<Buffer>>(),

  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: mocks.uploadBuffer,
  downloadBuffer: mocks.downloadBuffer,
  deleteObject: mocks.deleteObject,
  BUCKET_WISHLIST: mocks.BUCKET_WISHLIST,
}));

vi.mock("../storage", () => ({
  storage: {
    getUser: mocks.getUser,
    getWishlist: mocks.getWishlist,
    createOrUpdateWishlist: mocks.createOrUpdateWishlist,
    getWishlistPhotos: mocks.getWishlistPhotos,
    getWishlistMotos: mocks.getWishlistMotos,
    getWishlistPhotoCount: mocks.getWishlistPhotoCount,
    addWishlistPhoto: mocks.addWishlistPhoto,
    getWishlistPhoto: mocks.getWishlistPhoto,
    deleteWishlistPhoto: mocks.deleteWishlistPhoto,
  },
}));

vi.mock("../utils/image-processing", () => ({
  compressToWebP: mocks.compressToWebP,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    unlinkSync: mocks.unlinkSync,
    mkdirSync: mocks.mkdirSync,
  },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  unlinkSync: mocks.unlinkSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("../lib/auth-middleware", () => ({
  requireAuth: (req: { session: { userId?: string } }, _res: unknown, next: () => void) => {
    req.session.userId = "user-zav-1";
    next();
  },
}));

vi.mock("./motoclubs", () => ({ createClubInvitesForMoto: vi.fn() }));
vi.mock("../matching/notifications/classify", () => ({ classifyMatch: vi.fn().mockReturnValue("normal") }));
vi.mock("../matching/notifications/dispatcher", () => ({ dispatchMatchNotification: vi.fn().mockResolvedValue(undefined) }));

// ── Import after mocks ────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import wishlistRouter from "../routes/wishlist";

// ── App setup ─────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: { userId: string } }).session = { userId: "user-zav-1" };
    next();
  });
  app.use("/api/wishlist", wishlistRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_WISHLIST = { id: "wl-1", userId: "user-zav-1", description: "" };
const FAKE_WEBP = Buffer.from("WEBPDATA");

/** Encode bytes to base64 data-url */
function toBase64DataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadBuffer.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteWishlistPhoto.mockResolvedValue(undefined);
  mocks.existsSync.mockReturnValue(false);
  mocks.mkdirSync.mockReturnValue(undefined);
  mocks.compressToWebP.mockResolvedValue(FAKE_WEBP);
  mocks.getWishlist.mockResolvedValue(FAKE_WISHLIST);
  mocks.getWishlistPhotoCount.mockResolvedValue(0);
  mocks.getWishlistPhotos.mockResolvedValue([]);
  mocks.getWishlistMotos.mockResolvedValue([]);
});

// ── POST /photos ──────────────────────────────────────────────────────────────

describe("POST /api/wishlist/photos", () => {
  it("carica nel bucket e salva l'URL corretto nel DB", async () => {
    const fakePhoto = { id: "ph-1", wishlistId: "wl-1", photoUrl: "", sortOrder: 0 };
    mocks.addWishlistPhoto.mockImplementation(async (data: { photoUrl: string }) => ({
      ...fakePhoto,
      photoUrl: data.photoUrl,
    }));

    const rawBuf = Buffer.alloc(100, 0x42);
    const app = buildApp();
    const res = await request(app)
      .post("/api/wishlist/photos")
      .send({ imageBase64: toBase64DataUrl(rawBuf), filename: "test.jpg" });

    expect(res.status).toBe(201);

    // bucket upload called
    expect(mocks.uploadBuffer).toHaveBeenCalledOnce();
    const [bucketPath, buf, mime] = mocks.uploadBuffer.mock.calls[0] as [string, Buffer, string];
    expect(bucketPath).toMatch(/^Wishlist\/.+\.webp$/);
    expect(buf).toBe(FAKE_WEBP);
    expect(mime).toBe("image/webp");

    // saved URL must point to serve route
    expect(mocks.addWishlistPhoto).toHaveBeenCalledOnce();
    const savedData = mocks.addWishlistPhoto.mock.calls[0][0] as { photoUrl: string };
    expect(savedData.photoUrl).toMatch(/^\/api\/wishlist\/photos\/.+\.webp$/);

    // response contains the photo
    expect(res.body.photoUrl).toMatch(/^\/api\/wishlist\/photos\/.+\.webp$/);
  });

  it("rifiuta immagini oltre 8 MB", async () => {
    const bigBuf = Buffer.alloc(9 * 1024 * 1024, 0xff);
    const app = buildApp();
    const res = await request(app)
      .post("/api/wishlist/photos")
      .send({ imageBase64: toBase64DataUrl(bigBuf), filename: "big.jpg" });

    expect(res.status).toBe(400);
    expect(mocks.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rifiuta l'upload quando sono già presenti 3 foto", async () => {
    mocks.getWishlistPhotoCount.mockResolvedValue(3);
    const app = buildApp();
    const rawBuf = Buffer.alloc(100);
    const res = await request(app)
      .post("/api/wishlist/photos")
      .send({ imageBase64: toBase64DataUrl(rawBuf), filename: "extra.jpg" });

    expect(res.status).toBe(400);
    expect(mocks.uploadBuffer).not.toHaveBeenCalled();
  });
});

// ── GET /photos/:filename ─────────────────────────────────────────────────────

describe("GET /api/wishlist/photos/:filename", () => {
  it("risponde 200 con il buffer dal bucket", async () => {
    mocks.downloadBuffer.mockResolvedValue(FAKE_WEBP);
    const app = buildApp();
    const res = await request(app).get("/api/wishlist/photos/test_123.webp");

    expect(res.status).toBe(200);
    expect(mocks.downloadBuffer).toHaveBeenCalledWith("Wishlist/test_123.webp");
    expect(res.headers["content-type"]).toMatch(/image\/webp/);
  });

  it("cade sul disco se il bucket non ha il file (foto legacy)", async () => {
    mocks.downloadBuffer.mockRejectedValue(new Error("not found"));
    mocks.existsSync.mockReturnValue(true);
    const legacyBuf = Buffer.from("LEGACYPNG");
    mocks.readFileSync.mockReturnValue(legacyBuf);

    const app = buildApp();
    const res = await request(app).get("/api/wishlist/photos/old_photo.jpg");

    expect(res.status).toBe(200);
    expect(mocks.readFileSync).toHaveBeenCalled();
  });

  it("risponde 404 se non è né nel bucket né su disco", async () => {
    mocks.downloadBuffer.mockRejectedValue(new Error("not found"));
    mocks.existsSync.mockReturnValue(false);

    const app = buildApp();
    const res = await request(app).get("/api/wishlist/photos/ghost.webp");

    expect(res.status).toBe(404);
  });

  it("risponde 400 per path traversal", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/wishlist/photos/..%2Fsecret");
    expect(res.status).toBe(400);
  });
});

// ── DELETE /photos/:photoId ───────────────────────────────────────────────────

describe("DELETE /api/wishlist/photos/:photoId", () => {
  it("elimina l'oggetto dal bucket e il record DB", async () => {
    mocks.getWishlistPhoto.mockResolvedValue({
      id: "ph-1",
      wishlistId: "wl-1",
      photoUrl: "/api/wishlist/photos/myfile_123.webp",
    });

    const app = buildApp();
    const res = await request(app).delete("/api/wishlist/photos/ph-1");

    expect(res.status).toBe(200);
    expect(mocks.deleteObject).toHaveBeenCalledWith("Wishlist/myfile_123.webp");
    expect(mocks.deleteWishlistPhoto).toHaveBeenCalledWith("ph-1");
  });

  it("non chiama deleteObject per foto legacy (percorso /uploads/)", async () => {
    mocks.getWishlistPhoto.mockResolvedValue({
      id: "ph-legacy",
      wishlistId: "wl-1",
      photoUrl: "/uploads/wishlist/old_photo.jpg",
    });
    mocks.existsSync.mockReturnValue(false);

    const app = buildApp();
    const res = await request(app).delete("/api/wishlist/photos/ph-legacy");

    expect(res.status).toBe(200);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteWishlistPhoto).toHaveBeenCalledWith("ph-legacy");
  });
});
