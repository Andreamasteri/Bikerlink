import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const uploadRouter = Router();

const UPLOAD_DIR = "./uploads";

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Impossibile creare directory upload, uso directory corrente");
}

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Formato file non supportato. Usa JPG, PNG o WebP."));
  }
};

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

function handleUpload(fieldName: string, subfolder: string) {
  return [
    upload.single(fieldName),
    async (req: any, res: any) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Nessun file caricato" });
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        const newFilename = `${subfolder}-${Date.now()}${ext}`;
        const destDir = path.join(UPLOAD_DIR, subfolder);

        try {
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
        } catch (e) {}

        const destPath = path.join(destDir, newFilename);
        fs.renameSync(req.file.path, destPath);

        const url = `/uploads/${subfolder}/${newFilename}`;
        res.json({ url, filename: newFilename });
      } catch (err: any) {
        console.error("Errore upload:", err);
        res.status(500).json({ message: "Errore durante il caricamento" });
      }
    },
  ];
}

uploadRouter.post("/profile-photo", requireAuth, ...handleUpload("photo", "profiles"));
uploadRouter.post("/motorcycle-photo", requireAuth, ...handleUpload("photo", "motorcycles"));
uploadRouter.post("/route-photo", requireAuth, ...handleUpload("photo", "routes"));
uploadRouter.post("/contest-photo", requireAuth, ...handleUpload("photo", "contest"));
uploadRouter.post("/chat-image", requireAuth, ...handleUpload("photo", "chat"));
uploadRouter.post("/ad-image", requireAuth, requireAdmin, ...handleUpload("photo", "ads"));
uploadRouter.post("/splash-image", requireAuth, requireAdmin, ...handleUpload("photo", "splash"));
uploadRouter.post("/easter-egg-icon", requireAuth, requireAdmin, ...handleUpload("photo", "easter-eggs"));
uploadRouter.post("/workshop-logo", requireAuth, ...handleUpload("photo", "workshops"));
uploadRouter.post("/user-photo", requireAuth, ...handleUpload("photo", "user-photos"));
