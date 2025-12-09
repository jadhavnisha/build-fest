import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Validate and set OLLAMA_HOST
let OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
try {
  // Validate it's a proper URL
  const url = new URL(OLLAMA_HOST);
  if (!['http:', 'https:'].includes(url.protocol)) {
    console.warn(`Invalid OLLAMA_HOST protocol: ${url.protocol}. Using default.`);
    OLLAMA_HOST = 'http://localhost:11434';
  }
} catch (error) {
  console.warn(`Invalid OLLAMA_HOST URL: ${OLLAMA_HOST}. Using default.`);
  OLLAMA_HOST = 'http://localhost:11434';
}

/**
 * Execute Ollama embedding command via HTTP API
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model name
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text, model = 'nomic-embed-text') {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: text
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate chat completion using Ollama via HTTP API
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User message
 * @param {string} model - Model name
 * @returns {Promise<string>} - Model response
 */
export async function generateChatCompletion(systemPrompt, userPrompt, model = 'llama3') {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.message.content;
  } catch (error) {
    console.error('Error generating chat completion:', error.message);
    throw new Error(`Failed to generate chat completion: ${error.message}`);
  }
}

/**
 * Check if Ollama is running and model is available
 * @param {string} model - Model name to check
 * @returns {Promise<boolean>}
 */
export async function checkOllamaAvailability(model = 'llama3') {
  try {
    // Try HTTP API first
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    // Check if the model exists in the list
    if (data.models && Array.isArray(data.models)) {
      // Use exact match or startsWith for more precise matching
      return data.models.some(m => {
        const modelName = m.name || '';
        // Check for exact match or if the stored model name starts with the requested model
        return modelName === model || modelName.startsWith(`${model}:`);
      });
    }
    
    // If no model specified or API doesn't return models, just check if Ollama is running
    return true;
  } catch (error) {
    // Fallback to CLI command
    try {
      const { stdout } = await execAsync('ollama list');
      return stdout.includes(model);
    } catch (cliError) {
      return false;
    }
  }
}
