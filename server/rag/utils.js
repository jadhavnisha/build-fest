/**
 * Split text into chunks with overlap
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size of each chunk in characters
 * @param {number} overlap - Overlap between chunks in characters
 * @returns {string[]} - Array of text chunks
 */
export function chunkText(text, chunkSize = 2000, overlap = 200) {
  const chunks = [];
  
  // Split by paragraphs first for better semantic chunks
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length < chunkSize) {
      currentChunk += paragraph + '\n\n';
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }
      
      // Start new chunk with overlap
      if (currentChunk.length > overlap) {
        currentChunk = currentChunk.slice(-overlap) + paragraph + '\n\n';
      } else {
        currentChunk = paragraph + '\n\n';
      }
    }
  }
  
  // Add the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Normalize vector (for cosine similarity)
 * @param {number[]} vector - Input vector
 * @returns {number[]} - Normalized vector
 */
export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}
