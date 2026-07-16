/**
 * Tests: motorcycle photo routes (bucket-backed)
 *
 * Covers:
 *  - POST /api/motorcycles/:id/photos → oggetto nel bucket, URL corretto salvato nel DB
 *  - POST /api/motorcycles/:id/photos con limite 3 foto già raggiunto → 400
 *  - GET /api/motorcycles/photos/:filename → 200 dal bucket
 *  - GET /api/motorcycles/photos/:filename (non nel bucket) → 200 via fallback disco
 *  - GET /api/motorcycles/photos/:filename (né bucket né disco) → 404
 *  - GET /api/motorcycles/photos/:filename con path traversal → 404
 *  - DELETE /api/motorcycles/:id/photos/:photoId → oggetto rimosso dal bucket
 *  - DELETE /api/motorcycles/:id/photos/:photoId (foto legacy) → deleteObject non chiamato
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  uploadBuffer: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  downloadBuffer: vi.fn<[string], Promise<Buffer>>(),
  deleteObject: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  BUCKET_MOTO_PIC: "ProfilePic/motorcycles/",

  getUserMotorcycle: vi.fn(),
  getUserMotorcycles: vi.fn().mockResolvedValue([]),
  getMotorcyclePhotos: vi.fn().mockResolvedValue([]),
  getMotorcyclePhotoCount: vi.fn(),
  addMotorcyclePhoto: vi.fn(),
  getMotorcyclePhoto: vi.fn(),
  deleteMotorcyclePhoto: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn(),
  findMatchingWishlistMotos: vi.fn().mockResolvedValue([]),

  compressToWebP: vi.fn<[Buffer], Promise<Buffer>>(),

  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn<[string], Buffer>(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),

  // db select chain result rows
  dbSelectRows: [] as unknown[],
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: mocks.uploadBuffer,
  downloadBuffer: mocks.downloadBuffer,
  deleteObject: mocks.deleteObject,
  BUCKET_MOTO_PIC: mocks.BUCKET_MOTO_PIC,
}));

vi.mock("../storage", () => ({
  storage: {
    getUserMotorcycle: mocks.getUserMotorcycle,
    getUserMotorcycles: mocks.getUserMotorcycles,
    getMotorcyclePhotos: mocks.getMotorcyclePhotos,
    getMotorcyclePhotoCount: mocks.getMotorcyclePhotoCount,
    addMotorcyclePhoto: mocks.addMotorcyclePhoto,
    getMotorcyclePhoto: mocks.getMotorcyclePhoto,
    deleteMotorcyclePhoto: mocks.deleteMotorcyclePhoto,
    getUser: mocks.getUser,
    findMatchingWishlistMotos: mocks.findMatchingWishlistMotos,
  },
}));

vi.mock("../utils/image-processing", () => ({
  compressToWebP: mocks.compressToWebP,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    mkdirSync: mocks.mkdirSync,
    unlinkSync: mocks.unlinkSync,
  },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  mkdirSync: mocks.mkdirSync,
  unlinkSync: mocks.unlinkSync,
}));

vi.mock("../lib/auth-middleware", () => ({
  requireAuth: (req: { session: { userId?: string } }, _res: unknown, next: () => void) => {
    req.session.userId = "user-biker-1";
    next();
  },
}));

vi.mock("./motoclubs", () => ({ createClubInvitesForMoto: vi.fn() }));
vi.mock("../matching/notifications/classify", () => ({ classifyMatch: vi.fn().mockReturnValue("normal") }));
vi.mock("../matching/notifications/dispatcher", () => ({ dispatchMatchNotification: vi.fn().mockResolvedValue(undefined) }));

// Mock the db module with a chainable query builder so the ownership JOIN in
// GET /photos/:filename resolves to mocks.dbSelectRows
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

// ── Import after mocks ────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import motorcyclesRouter from "../routes/motorcycles";

// We need a handle to the db mock to control the JOIN query result
import { db } from "../db";

// ── App setup ─────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: { userId: string } }).session = { userId: "user-biker-1" };
    next();
  });
  app.use("/api/motorcycles", motorcyclesRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_WEBP = Buffer.from("WEBPDATA");
const FAKE_MOTO = { id: "moto-1", userId: "user-biker-1", brand: "Honda", model: "CB650R" };

function toBase64DataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadBuffer.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteMotorcyclePhoto.mockResolvedValue(undefined);
  mocks.existsSync.mockReturnValue(false);
  mocks.readFileSync.mockReturnValue(Buffer.from([]));
  mocks.mkdirSync.mockReturnValue(undefined);
  mocks.compressToWebP.mockResolvedValue(FAKE_WEBP);
  mocks.getUserMotorcycle.mockResolvedValue(FAKE_MOTO);
  mocks.getMotorcyclePhotoCount.mockResolvedValue(0);
  mocks.getMotorcyclePhotos.mockResolvedValue([]);
});

// ── POST /api/motorcycles/:id/photos ─────────────────────────────────────────

describe("POST /api/motorcycles/:id/photos", () => {
  it("carica nel bucket e salva l'URL corretto nel DB", async () => {
    const fakePhoto = { id: "ph-1", motorcycleId: "moto-1", photoUrl: "", sortOrder: 0 };
    mocks.addMotorcyclePhoto.mockImplementation(async (data: { photoUrl: string }) => ({
      ...fakePhoto,
      photoUrl: data.photoUrl,
    }));

    const rawBuf = Buffer.alloc(100, 0x42);
    const app = buildApp();
    const res = await request(app)
      .post("/api/motorcycles/moto-1/photos")
      .send({ imageBase64: toBase64DataUrl(rawBuf) });

    expect(res.status).toBe(201);

    // bucket upload called
    expect(mocks.uploadBuffer).toHaveBeenCalledOnce();
    const [bucketPath, buf, mime] = mocks.uploadBuffer.mock.calls[0] as [string, Buffer, string];
    expect(bucketPath).toMatch(/^ProfilePic\/motorcycles\/.+\.webp$/);
    expect(buf).toBe(FAKE_WEBP);
    expect(mime).toBe("image/webp");

    // saved URL must point to serve route
    expect(mocks.addMotorcyclePhoto).toHaveBeenCalledOnce();
    const savedData = mocks.addMotorcyclePhoto.mock.calls[0][0] as { photoUrl: string };
    expect(savedData.photoUrl).toMatch(/^\/api\/motorcycles\/photos\/.+\.webp$/);

    // response contains the photo with the correct URL
    expect(res.body.photoUrl).toMatch(/^\/api\/motorcycles\/photos\/.+\.webp$/);
  });

  it("rifiuta l'upload quando sono già presenti 3 foto", async () => {
    mocks.getMotorcyclePhotoCount.mockResolvedValue(3);
    const rawBuf = Buffer.alloc(100);
    const app = buildApp();
    const res = await request(app)
      .post("/api/motorcycles/moto-1/photos")
      .send({ imageBase64: toBase64DataUrl(rawBuf) });

    expect(res.status).toBe(400);
    expect(mocks.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rifiuta se la moto non appartiene all'utente", async () => {
    mocks.getUserMotorcycle.mockResolvedValue({ ...FAKE_MOTO, userId: "other-user" });
    const rawBuf = Buffer.alloc(100);
    const app = buildApp();
    const res = await request(app)
      .post("/api/motorcycles/moto-1/photos")
      .send({ imageBase64: toBase64DataUrl(rawBuf) });

    expect(res.status).toBe(403);
    expect(mocks.uploadBuffer).not.toHaveBeenCalled();
  });
});

// ── GET /api/motorcycles/photos/:filename ─────────────────────────────────────

describe("GET /api/motorcycles/photos/:filename", () => {
  it("risponde 200 con il buffer dal bucket", async () => {
    // ownership JOIN returns current user as owner
    const selectSpy = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: "user-biker-1" }]),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    mocks.downloadBuffer.mockResolvedValue(FAKE_WEBP);
    const app = buildApp();
    const res = await request(app).get("/api/motorcycles/photos/test_123.webp");

    expect(res.status).toBe(200);
    expect(mocks.downloadBuffer).toHaveBeenCalledWith("ProfilePic/motorcycles/test_123.webp");
    expect(res.headers["content-type"]).toMatch(/image\/webp/);

    selectSpy.mockRestore();
  });

  it("cade sul disco se il bucket non ha il file (foto legacy)", async () => {
    const selectSpy = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: "user-biker-1" }]),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const legacyBuf = Buffer.from("LEGACYJPG");
    mocks.downloadBuffer.mockRejectedValue(new Error("not found in bucket"));
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(legacyBuf);

    const app = buildApp();
    const res = await request(app).get("/api/motorcycles/photos/old_photo.jpg");

    expect(res.status).toBe(200);
    expect(mocks.downloadBuffer).toHaveBeenCalledWith("ProfilePic/motorcycles/old_photo.jpg");
    expect(mocks.existsSync).toHaveBeenCalled();
    expect(mocks.readFileSync).toHaveBeenCalled();
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);

    selectSpy.mockRestore();
  });

  it("risponde 404 se né nel bucket né su disco", async () => {
    const selectSpy = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: "user-biker-1" }]),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    mocks.downloadBuffer.mockRejectedValue(new Error("not found"));
    mocks.existsSync.mockReturnValue(false);

    const app = buildApp();
    const res = await request(app).get("/api/motorcycles/photos/ghost.webp");

    expect(res.status).toBe(404);

    selectSpy.mockRestore();
  });

  it("risponde 404 per path traversal", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/motorcycles/photos/..%2Fsecret");
    expect(res.status).toBe(404);
    expect(mocks.downloadBuffer).not.toHaveBeenCalled();
  });

  it("risponde 404 se la foto non appartiene all'utente", async () => {
    const selectSpy = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: "other-user" }]),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const app = buildApp();
    const res = await request(app).get("/api/motorcycles/photos/somefile.webp");

    expect(res.status).toBe(404);
    expect(mocks.downloadBuffer).not.toHaveBeenCalled();

    selectSpy.mockRestore();
  });
});

// ── DELETE /api/motorcycles/:id/photos/:photoId ───────────────────────────────

describe("DELETE /api/motorcycles/:id/photos/:photoId", () => {
  it("elimina l'oggetto dal bucket e il record DB", async () => {
    mocks.getMotorcyclePhoto.mockResolvedValue({
      id: "ph-1",
      motorcycleId: "moto-1",
      photoUrl: "/api/motorcycles/photos/myfile_123.webp",
    });
    mocks.getUserMotorcycle.mockResolvedValue(FAKE_MOTO);

    const app = buildApp();
    const res = await request(app).delete("/api/motorcycles/moto-1/photos/ph-1");

    expect(res.status).toBe(200);
    expect(mocks.deleteObject).toHaveBeenCalledWith("ProfilePic/motorcycles/myfile_123.webp");
    expect(mocks.deleteMotorcyclePhoto).toHaveBeenCalledWith("ph-1");
  });

  it("non chiama deleteObject per foto legacy (/uploads/motorcycles/)", async () => {
    mocks.getMotorcyclePhoto.mockResolvedValue({
      id: "ph-legacy",
      motorcycleId: "moto-1",
      photoUrl: "/uploads/motorcycles/old_photo.jpg",
    });
    mocks.getUserMotorcycle.mockResolvedValue(FAKE_MOTO);
    mocks.existsSync.mockReturnValue(false);

    const app = buildApp();
    const res = await request(app).delete("/api/motorcycles/moto-1/photos/ph-legacy");

    expect(res.status).toBe(200);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteMotorcyclePhoto).toHaveBeenCalledWith("ph-legacy");
  });

  it("risponde 404 se la foto non esiste", async () => {
    mocks.getMotorcyclePhoto.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).delete("/api/motorcycles/moto-1/photos/ghost-ph");

    expect(res.status).toBe(404);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteMotorcyclePhoto).not.toHaveBeenCalled();
  });

  it("risponde 404 se la moto non appartiene all'utente", async () => {
    mocks.getMotorcyclePhoto.mockResolvedValue({
      id: "ph-1",
      motorcycleId: "moto-1",
      photoUrl: "/api/motorcycles/photos/myfile_123.webp",
    });
    mocks.getUserMotorcycle.mockResolvedValue({ ...FAKE_MOTO, userId: "other-user" });

    const app = buildApp();
    const res = await request(app).delete("/api/motorcycles/moto-1/photos/ph-1");

    expect(res.status).toBe(404);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteMotorcyclePhoto).not.toHaveBeenCalled();
  });
});
