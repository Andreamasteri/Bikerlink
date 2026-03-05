import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "photos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato. Usa JPEG, PNG o WebP."));
    }
  },
});

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const allUsers = await storage.getAllUsers();
    const results = allUsers
      .filter((u) => u.id !== req.session.userId)
      .map((u) => ({
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        userType: u.userType,
      }));
    return res.json(results);
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);

    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const allowedUserFields = ["nickname", "phone", "sex", "coupleSexConfig", "birthYear", "region", "avatarUrl"];
    const userUpdate: Record<string, unknown> = {};
    for (const field of allowedUserFields) {
      if (req.body[field] !== undefined) {
        userUpdate[field] = req.body[field];
      }
    }

    if (Object.keys(userUpdate).length > 0) {
      if (userUpdate.nickname) {
        const existing = await storage.getUserByNickname(userUpdate.nickname as string);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Nickname già in uso" });
        }
      }
      await storage.updateUser(userId, userUpdate as any);
    }

    const allowedProfileFields = ["bio", "maxPickupDistance", "latitude", "longitude"];
    const profileUpdate: Record<string, unknown> = {};
    for (const field of allowedProfileFields) {
      if (req.body[field] !== undefined) {
        profileUpdate[field] = req.body[field];
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        await storage.updateUserProfile(userId, profileUpdate as any);
      } else {
        await storage.createUserProfile({ userId, ...profileUpdate } as any);
      }
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);

    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    return res.json({
      ...safeUser,
      ...(profile || {}),
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/profile/dynamic", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { isAvailable, latitude, longitude, searchPreference } = req.body;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Record<string, unknown> = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (searchPreference !== undefined) updateData.searchPreference = searchPreference;

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { isAvailable, latitude, longitude } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable deve essere un booleano" });
    }

    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Record<string, unknown> = { isAvailable };

    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      return res.json(profile);
    }
  } catch (error) {
    console.error("Toggle availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = targetUser;
    const profile = await storage.getUserProfile(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    return res.json({
      ...safeUser,
      bio: profile?.bio || null,
      motorcycles,
    });
  } catch (error) {
    console.error("Get public user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/online-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const count = await storage.countActiveUsers(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Online count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const count = await storage.countAvailableUsers(fifteenMinutesAgo);
    return res.json({ count });
  } catch (error) {
    console.error("Available count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/online-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const results = await storage.getOnlineUsersList(fifteenMinutesAgo, lat, lng);
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of results) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = results
      .filter((item: any) => item.user.id !== req.session.userId)
      .map((item: any) => {
        const motos = motorcyclesMap[item.user.id] || [];
        const firstMoto = motos[0];
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          region: item.user.region,
          birthYear: item.user.birthYear,
          bio: item.profile?.bio || null,
          moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
          ridingStyle: firstMoto?.ridingStyle || null,
          distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
          isAvailable: item.profile?.isAvailable || false,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Online list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const results = await storage.getAvailableUsersList(fifteenMinutesAgo, lat, lng);
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of results) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = results
      .filter((item: any) => item.user.id !== req.session.userId)
      .map((item: any) => {
        const motos = motorcyclesMap[item.user.id] || [];
        const firstMoto = motos[0];
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          region: item.user.region,
          birthYear: item.user.birthYear,
          bio: item.profile?.bio || null,
          moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
          ridingStyle: firstMoto?.ridingStyle || null,
          distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
          isAvailable: true,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/nearby", requireAuth, async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string) || 50;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Parametri lat e lng richiesti" });
    }

    const nearbyUsers = await storage.getNearbyUsers(lat, lng, radius);

    const results = nearbyUsers
      .filter((item) => item.user.id !== req.session.userId)
      .map((item) => {
        const { password: _, ...safeUser } = item.user;
        return {
          ...safeUser,
          profile: item.profile,
          distance: Math.round(item.distance * 10) / 10,
        };
      });

    return res.json(results);
  } catch (error) {
    console.error("Nearby users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/photos", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (user.userType === "zavorrina") {
      const count = await storage.getUserPhotoCount(userId);
      if (count >= 3) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: "Massimo 3 foto consentite per le zavorrine" });
      }
    }

    if (!req.file) {
      return res.status(400).json({ message: "Nessuna foto caricata" });
    }

    const photoUrl = `/uploads/photos/${req.file.filename}`;
    const sortOrder = await storage.getUserPhotoCount(userId);

    const photo = await storage.createUserPhoto({
      userId,
      photoUrl,
      sortOrder,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/me/photos/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const photoId = req.params.id as string;

    const photo = await storage.getUserPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    if (photo.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const filePath = path.join(process.cwd(), photo.photoUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await storage.deleteUserPhoto(photoId);

    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/request-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.requestUserDeletion(userId);
    req.session.destroy(() => {});
    return res.json({ message: "Richiesta di cancellazione inviata. Il tuo account sarà eliminato tra 30 giorni." });
  } catch (error) {
    console.error("Request deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/cancel-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.cancelUserDeletion(userId);
    return res.json({ message: "Richiesta di cancellazione annullata." });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
