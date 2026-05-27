import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  textAliases,
  tags,
  type TextAlias,
  type InsertTextAlias,
  type TextAliasCategory,
} from "@shared/db";
import { TagsStorage } from "./tags";
import { normalizeText } from "../text-interpreter/interpret";

/**
 * Text aliases storage (Task #2518).
 * CRUD usato dal pannello admin per gestire alias manuali e dalla pipeline
 * di interpretazione testo.
 */
export class TextAliasesStorage extends TagsStorage {
  async listTextAliases(category?: string): Promise<Array<TextAlias & { tagLabel: string | null }>> {
    const rows = await db
      .select({
        id: textAliases.id,
        category: textAliases.category,
        inputNormalized: textAliases.inputNormalized,
        targetId: textAliases.targetId,
        targetValue: textAliases.targetValue,
        confidence: textAliases.confidence,
        source: textAliases.source,
        createdAt: textAliases.createdAt,
        tagLabel: tags.label,
      })
      .from(textAliases)
      .leftJoin(tags, eq(tags.id, textAliases.targetId))
      .where(category ? eq(textAliases.category, category) : sql`true`)
      .orderBy(asc(textAliases.category), desc(textAliases.confidence), asc(textAliases.inputNormalized));
    return rows;
  }

  async createTextAlias(
    input: Omit<InsertTextAlias, "id" | "createdAt" | "inputNormalized"> & {
      input: string;
    },
  ): Promise<TextAlias> {
    const normalized = normalizeText(input.input);
    if (!normalized) throw new Error("Input vuoto dopo normalizzazione");
    if (!input.targetId && !input.targetValue) {
      throw new Error("È necessario specificare targetId o targetValue");
    }
    const [row] = await db
      .insert(textAliases)
      .values({
        category: input.category,
        inputNormalized: normalized,
        targetId: input.targetId ?? null,
        targetValue: input.targetValue ?? null,
        confidence: input.confidence ?? 1.0,
        source: input.source ?? "manual",
      })
      .returning();
    return row;
  }

  async deleteTextAlias(id: string): Promise<boolean> {
    const result = await db
      .delete(textAliases)
      .where(eq(textAliases.id, id))
      .returning({ id: textAliases.id });
    return result.length > 0;
  }

  async findAliasExact(
    category: TextAliasCategory,
    inputNormalized: string,
  ): Promise<TextAlias | undefined> {
    const [row] = await db
      .select()
      .from(textAliases)
      .where(
        and(
          eq(textAliases.category, category),
          eq(textAliases.inputNormalized, inputNormalized),
        ),
      )
      .limit(1);
    return row;
  }
}
