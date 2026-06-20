import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { arcadeScores } from "@shared/db";
import { arcadeScoreSchema } from "@shared/validators";
import { eq, sql, max, and } from "drizzle-orm";

import { requireUserId } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

const VALID_GAMES = ["endless_biker", "traffic_racer", "wheelie", "tetris", "space_invaders"] as const;
type GameId = (typeof VALID_GAMES)[number];

const SCORE_CAPS: Record<GameId, number> = {
  endless_biker: 50_000,
  traffic_racer: 500_000,
  wheelie: 3_600,
  tetris: 2_000_000,
  space_invaders: 500_000,
};

router.post("/score", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const parsed = arcadeScoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0].message);
  }
  const { game, score } = parsed.data;

  if (!VALID_GAMES.includes(game as GameId)) {
    return sendError(res, 400, "Gioco non valido");
  }
  const validGame = game as GameId;
  if (score > SCORE_CAPS[validGame]) {
    return sendError(res, 400, "Punteggio non plausibile");
  }

  try {
    const [existing] = await db
      .select({ bestScore: max(arcadeScores.score) })
      .from(arcadeScores)
      .where(and(eq(arcadeScores.userId, userId), eq(arcadeScores.game, game as GameId)));

    if (existing?.bestScore !== null && existing?.bestScore !== undefined && score <= existing.bestScore) {
      return sendSuccess(res, { skipped: true });
    }

    const [entry] = await db
      .insert(arcadeScores)
      .values({ userId, game: game as GameId, score })
      .returning();
    return sendSuccess(res, { entry });
  } catch (err) {
    console.error("arcade score error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/leaderboard/:game", async (req: Request, res: Response) => {
  const { game } = req.params as { game: string };

  if (!VALID_GAMES.includes(game as GameId)) {
    return sendError(res, 400, "Gioco non valido");
  }

  try {
    const result = await withDbRetry(() => db.execute<{
      user_id: string;
      best_score: number;
      best_at: Date;
      nickname: string;
      avatar_url: string | null;
    }>(sql`
      WITH user_best AS (
        SELECT user_id, MAX(score) AS best_score
        FROM arcade_scores
        WHERE game = ${game}
        GROUP BY user_id
      ),
      user_best_time AS (
        SELECT ub.user_id, ub.best_score,
               MIN(s.created_at) AS best_at
        FROM user_best ub
        JOIN arcade_scores s ON s.user_id = ub.user_id
          AND s.game = ${game}
          AND s.score = ub.best_score
        GROUP BY ub.user_id, ub.best_score
      )
      SELECT bt.user_id, bt.best_score, bt.best_at, u.nickname, u.avatar_url
      FROM user_best_time bt
      JOIN users u ON bt.user_id = u.id
      ORDER BY bt.best_score DESC, bt.best_at ASC
      LIMIT 10
    `));

    const rows = result.rows.map((r) => ({
      userId: r.user_id,
      bestScore: Number(r.best_score),
      nickname: r.nickname,
      avatarUrl: r.avatar_url ?? null,
    }));

    return res.json(rows);
  } catch (err) {
    console.error("arcade leaderboard error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/hall-of-fame", async (_req: Request, res: Response) => {
  try {
    const result = await withDbRetry(() => db.execute<{
      game: string;
      user_id: string;
      score: number;
      created_at: Date;
      nickname: string;
      avatar_url: string | null;
    }>(sql`
      WITH per_user_best AS (
        SELECT
          s.game,
          s.user_id,
          MAX(s.score) AS score,
          MIN(s.created_at) FILTER (WHERE s.score = (
            SELECT MAX(s2.score) FROM arcade_scores s2
            WHERE s2.user_id = s.user_id AND s2.game = s.game
          )) AS created_at
        FROM arcade_scores s
        GROUP BY s.game, s.user_id
      ),
      ranked AS (
        SELECT
          p.game,
          p.user_id,
          p.score,
          p.created_at,
          u.nickname,
          u.avatar_url,
          ROW_NUMBER() OVER (
            PARTITION BY p.game
            ORDER BY p.score DESC, p.created_at ASC
          ) AS rn
        FROM per_user_best p
        INNER JOIN users u ON p.user_id = u.id
      )
      SELECT game, user_id, score, created_at, nickname, avatar_url
      FROM ranked
      WHERE rn = 1
    `));

    const results: Record<string, { game: string; userId: string; nickname: string; avatarUrl: string | null; score: number; date: string }> = {};
    for (const row of result.rows) {
      results[row.game] = {
        game: row.game,
        userId: row.user_id,
        nickname: row.nickname,
        avatarUrl: row.avatar_url ?? null,
        score: Number(row.score),
        date: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    }

    return res.json(results);
  } catch (err) {
    console.error("arcade hall-of-fame error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/my-scores", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select({
        game: arcadeScores.game,
        bestScore: max(arcadeScores.score).as("best_score"),
      })
      .from(arcadeScores)
      .where(eq(arcadeScores.userId, userId))
      .groupBy(arcadeScores.game);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.game] = row.bestScore ?? 0;
    }
    return res.json(result);
  } catch (err) {
    console.error("arcade my-scores error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
