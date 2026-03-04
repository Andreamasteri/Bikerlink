import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const usersRouter = Router();

usersRouter.get("/profile", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const profile = await storage.getUserProfile(user.id);
    const photos = await storage.getUserPhotos(user.id);
    const { passwordHash: _, ...safeUser } = user;
    res.json({ user: safeUser, profile, photos });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento profilo" });
  }
});

usersRouter.put("/profile", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { nickname, profilePhotoUrl, region, phone, userType, coupleSexConfig, sex } = req.body;

    const updateData: any = {};
    if (nickname !== undefined) {
      const existing = await storage.getUserByNickname(nickname);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ message: "Nickname già in uso" });
      }
      updateData.nickname = nickname;
    }
    if (profilePhotoUrl !== undefined) updateData.profilePhotoUrl = profilePhotoUrl;
    if (region !== undefined) updateData.region = region;
    if (phone !== undefined) updateData.phone = phone;
    if (userType !== undefined) updateData.userType = userType;
    if (coupleSexConfig !== undefined) updateData.coupleSexConfig = coupleSexConfig;
    if (sex !== undefined) updateData.sex = sex;

    const updated = await storage.updateUser(user.id, updateData);
    const { passwordHash: _, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento profilo" });
  }
});

usersRouter.put("/profile/dynamic", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const {
      motorcycleType, motorcyclePhotoUrl, ridingStyle,
      maxPickupDistanceKm, isAvailable, availabilityType,
      departureLocation, departureTime, shareExactLocation,
    } = req.body;

    const profile = await storage.updateUserProfile(user.id, {
      motorcycleType, motorcyclePhotoUrl, ridingStyle,
      maxPickupDistanceKm, isAvailable, availabilityType,
      departureLocation, departureTime, shareExactLocation,
    });

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento profilo dinamico" });
  }
});

usersRouter.get("/nearby", requireAuth, async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: "Posizione obbligatoria" });
    }
    const radiusKm = Number(radius) || 50;
    const users = await storage.getNearbyUsers(Number(lat), Number(lng), radiusKm);
    const currentUser = (req as any).user;
    const filtered = users.filter(u => u.user.id !== currentUser.id);
    res.json({
      users: filtered.map(u => {
        const { passwordHash: _, ...safeUser } = u.user;
        return { user: safeUser, profile: u.profile };
      })
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nella ricerca utenti vicini" });
  }
});

usersRouter.put("/location", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { latitude, longitude, city } = req.body;
    await storage.updateUserProfile(user.id, {
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastCity: city,
    });
    res.json({ message: "Posizione aggiornata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento posizione" });
  }
});

usersRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    const profile = await storage.getUserProfile(user.id);
    const photos = await storage.getUserPhotos(user.id);
    const { passwordHash: _, ...safeUser } = user;
    res.json({ user: safeUser, profile, photos });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento profilo" });
  }
});

usersRouter.post("/photos", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { photoUrl, sortOrder } = req.body;
    if (!photoUrl) return res.status(400).json({ message: "URL foto obbligatorio" });
    const photo = await storage.addUserPhoto(user.id, photoUrl, sortOrder || 0);
    res.status(201).json({ photo });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Errore nell'aggiunta foto" });
  }
});

usersRouter.delete("/photos/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteUserPhoto(req.params.id);
    res.json({ message: "Foto eliminata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'eliminazione foto" });
  }
});
