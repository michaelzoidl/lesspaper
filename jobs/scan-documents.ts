import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('jobs:scan-documents');

export async function scanDocuments() {
  try {
    const db = await DatabaseConnection.getInstance();

    // Ensure documents table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        meta TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    logger.info('Ensured documents table exists');
    
    // Get all document source paths from config
    const sourcePaths = await db.prepare(
      "SELECT value FROM config WHERE setting LIKE 'document-source-%'"
    ).all() as { value: string }[];

    if (sourcePaths.length === 0) {
      logger.warn('No document sources configured');
      return;
    }

    // Each value is already an absolute path
    const paths = sourcePaths.map(row => row.value);

    for (const basePath of paths) {
      // Walk through all files in the directory recursively
      for await (const entry of walk(basePath, {
        exts: ['.pdf'],
        followSymlinks: false,
      })) {
        if (entry.isFile) {
          try {
            // Check if document already exists
            const selectStmt = db.prepare("SELECT id FROM documents WHERE path = ?");
            const exists = await selectStmt.get([entry.path]);
            selectStmt.finalize();

            if (!exists) {
              // Read PDF metadata using native Deno.readFile
              const file = await Deno.readFile(entry.path);
              const stat = await Deno.stat(entry.path);
              const meta: Record<string, unknown> = {
                size: file.length,
                lastModified: stat.mtime?.toISOString(),
              };

              // Insert new document
              const insertStmt = db.prepare("INSERT INTO documents (path, meta) VALUES (?, ?)");
              await insertStmt.run([entry.path, JSON.stringify(meta)]);
              insertStmt.finalize();

              logger.info(`Added new document: ${entry.path}`);
            }
          } catch (error) {
            logger.error(`Error processing file ${entry.path}: ${error instanceof Error ? error.message : 'Unknown error'}`, {
              error: error instanceof Error ? { 
                message: error.message,
                stack: error.stack,
                name: error.name
              } : error
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error in scanDocuments job:', error);
  }
}
