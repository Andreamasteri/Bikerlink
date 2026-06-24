export {
  generateEmbedding,
  generateEmbeddings,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_TAG,
  EMBEDDING_DIMENSIONS,
} from "./client";
export {
  upsertEmbedding,
  findSimilar,
  deleteEmbedding,
  hnswIndexExists,
  getHnswIndexStatus,
  type UpsertEmbeddingResult,
  type SimilarHit,
  type HnswIndexStatus,
} from "./store";
