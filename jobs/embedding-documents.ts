// import { DatabaseConnection } from '../lib/database.ts';
// import { createLogger } from '../lib/logger.ts';
// import * as tf from 'npm:@tensorflow/tfjs-core';
// import '@tensorflow/tfjs-backend-cpu';
// import '@tensorflow/tfjs-converter';
// import { load } from 'npm:@tensorflow-models/universal-sentence-encoder';

// const logger = createLogger('jobs:embedding-documents');

// export async function embeddingDocuments() {
//   logger.info('Starting embedding documents job');

//   // Suppress tfjs Node.js warning
//   const env = Deno.env.toObject();
//   if (!env.DISABLE_TFJS_NODE_BACKEND_WARNING) {
//     await Deno.env.set('DISABLE_TFJS_NODE_BACKEND_WARNING', '1');
//   }
  
//   // Initialize TensorFlow.js backend
//   logger.info('Initializing TensorFlow.js backend...');
//   try {
//     await tf.setBackend('cpu');
//     await tf.ready();
//     logger.info('Successfully initialized TensorFlow.js CPU backend');
//     logger.info('Current backend:', await tf.getBackend());
//   } catch (backendError) {
//     logger.error('Failed to initialize TensorFlow.js backend:', backendError);
//     throw backendError;
//   }
//   try {
//     const db = await DatabaseConnection.getInstance();

//     // Create blocks table if it doesn't exist
//     await db.prepare(`
//       CREATE TABLE IF NOT EXISTS blocks (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         document_id INTEGER NOT NULL,
//         content TEXT NOT NULL,
//         embedding BLOB NOT NULL,
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (document_id) REFERENCES documents(id)
//       )
//     `).run();
//     logger.info('Ensured blocks table exists');

//     // Get documents that have content but no embeddings
//     const documents = await db.prepare(`
//       SELECT d.id, d.content 
//       FROM documents d 
//       LEFT JOIN blocks b ON d.id = b.document_id
//       WHERE d.content IS NOT NULL 
//       AND d.content != ''
//       AND b.id IS NULL
//     `).all() as { id: number; content: string }[];

//     if (documents.length === 0) {
//       logger.info('No documents requiring embeddings found');
//       return;
//     }

//     logger.info(`Found ${documents.length} documents requiring embeddings`);

//     // Load the Universal Sentence Encoder model
//     logger.info('Loading Universal Sentence Encoder model...');
//     let model;
//     try {
//       model = await load();
//       logger.info('Successfully loaded Universal Sentence Encoder model');
//     } catch (modelError) {
//       logger.error('Failed to load Universal Sentence Encoder model:', modelError);
//       throw modelError;
//     }

//     for (const document of documents) {
//       try {
//         // Split content into chunks (simple sentence-based splitting for now)
//         const blocks = document.content
//           .split(/[.!?]/)
//           .map(block => block.trim())
//           .filter(block => block.length > 0);

//         // Generate embeddings for each block
//         for (const block of blocks) {
//           const embeddingTensor = await model.embed([block]);
//           const embeddingArray = await embeddingTensor.array();
//           const embedding = new Float32Array(embeddingArray[0]);
          
//           // Convert Float32Array to Uint8Array for storage
//           const embeddingBlob = new Uint8Array(embedding.buffer);
          
//           // Store block and its embedding
//           await db.prepare(`
//             INSERT INTO blocks (document_id, content, embedding)
//             VALUES (?, ?, ?)
//           `).run([document.id, block, embeddingBlob]);
//         }

//         logger.info(`Generated embeddings for document ${document.id}`);
//       } catch (error) {
//         const errorDetails = error instanceof Error ? {
//           name: error.name,
//           message: error.message,
//           stack: error.stack
//         } : error;
        
//         logger.error(`Error generating embeddings for document ${document.id}. Details:`, errorDetails);
//       }
//     }

//     logger.info('Finished generating embeddings');
//   } catch (error) {
//     const errorDetails = error instanceof Error ? {
//       name: error.name,
//       message: error.message,
//       stack: error.stack
//     } : error;
    
//     logger.error('Error in embedding documents job. Details:', errorDetails);
//     throw error; // Re-throw to ensure the job scheduler knows it failed
//   }
// }
