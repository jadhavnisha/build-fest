import { normalizeVector } from './utils.js';

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First embedding vector
 * @param {number[]} vecB - Second embedding vector
 * @returns {number} - Similarity score between 0 and 1
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Search for most relevant chunks based on query embedding
 * @param {number[]} queryEmbedding - The embedding vector of the query
 * @param {Array} chunks - Array of chunks with embeddings
 * @param {number} topK - Number of top results to return
 * @returns {Array} - Top K most similar chunks with scores
 */
export function searchSimilarChunks(queryEmbedding, chunks, topK = 5) {
  // Calculate similarity for each chunk
  const results = chunks.map(chunk => ({
    ...chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  
  // Sort by similarity in descending order
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Return top K results
  return results.slice(0, topK);
}
