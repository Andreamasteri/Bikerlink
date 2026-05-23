import multer from "multer";
import path from "path";
import { uploadBuffer } from "../../objectStorage";

export const eventUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Solo immagini JPEG, PNG o WebP"));
  },
});

export async function uploadEventImage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const filename = uniqueSuffix + path.extname(originalname || ".jpg");
  const objectPath = `public/events/${filename}`;
  await uploadBuffer(objectPath, buffer, mimetype);
  return `/api/events/images/${filename}`;
}
