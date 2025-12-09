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
 * Check if error is a connection failure
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
function isConnectionError(error) {
  // Check for ECONNREFUSED
  if (error.cause?.code === 'ECONNREFUSED' || error.code === 'ECONNREFUSED') {
    return true;
  }
  
  // Check for fetch-related TypeErrors (network failures)
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }
  
  // Check for other common network error codes
  const networkErrorCodes = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'];
  if (error.message) {
    for (const code of networkErrorCodes) {
      if (error.message.includes(code)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Handle connection errors with helpful messages
 * @throws {Error}
 */
function handleConnectionError() {
  console.error(`\n❌ Cannot connect to Ollama at ${OLLAMA_HOST}`);
  console.error('Please ensure:');
  console.error('  1. Ollama is installed: ollama --version');
  console.error('  2. Ollama service is running: ollama serve');
  console.error('  3. The service is accessible at: ' + OLLAMA_HOST);
  console.error(`  4. Test with: curl ${OLLAMA_HOST}/api/tags\n`);
  throw new Error(`Cannot connect to Ollama service at ${OLLAMA_HOST}. Is Ollama running?`);
}

/**
 * Get OLLAMA_HOST value
 * @returns {string}
 */
export function getOllamaHost() {
  return OLLAMA_HOST;
}

/**
 * Execute Ollama embedding command via HTTP API
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model name
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text, model = 'nomic-embed-text') {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        input: text  // Changed from 'prompt' to 'input' for /api/embed endpoint
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
    
    const data = await response.json();
    // /api/embed returns 'embeddings' array, we want the first one
    if (data.embeddings && Array.isArray(data.embeddings) && data.embeddings.length > 0) {
      return data.embeddings[0];
    }
    // Fallback for unexpected response format
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.warn('Unexpected embedding response format. Keys:', Object.keys(data));
    }
    throw new Error('Unexpected response format from Ollama embedding API');
  } catch (error) {
    // Log detailed error information for debugging (only in debug/dev mode)
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.error('\n🔍 Debug info:', {
        name: error.name,
        message: error.message,
        code: error.code,
        cause: error.cause,
        causeName: error.cause?.name,
        causeCode: error.cause?.code
      });
    }
    
    if (isConnectionError(error)) {
      handleConnectionError(); // This throws, so no code after this executes
    }
    // Only reached if not a connection error
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
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
    
    const data = await response.json();
    return data.message.content;
  } catch (error) {
    if (isConnectionError(error)) {
      handleConnectionError(); // This throws, so no code after this executes
    }
    // Only reached if not a connection error
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
