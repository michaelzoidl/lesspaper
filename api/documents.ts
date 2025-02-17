import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('api:documents');
const router = new Router();

interface Document {
  id: number;
  path: string;
  meta: string;
  // content: string | null;
  created_at: string;
  updated_at: string;
}

interface SearchResultDocument extends Document {
  relevantContent: Array<{
    content: string;
    similarity: number;
  }>;
}


router.get("/api/documents", async (ctx) => {
  try {
    const db = await DatabaseConnection.getInstance();
    const url = new URL(ctx.request.url);
    const searchQuery = url.searchParams.get("search")?.toLowerCase();

    let stmt;
    if (searchQuery) {
      // If search query is provided, search through meta and content
      stmt = db.prepare(`
        SELECT id, path, meta, created_at, updated_at 
        FROM documents 
        WHERE 
          LOWER(meta) LIKE ? OR 
          LOWER(path) LIKE ? 
        ORDER BY created_at DESC
      `);
      const searchPattern = `%${searchQuery}%`;
      const rawDocuments = await stmt.all(searchPattern, searchPattern) as Record<string, unknown>[];
      stmt.finalize();

      // Transform raw documents into properly typed Document objects
      const documents: Document[] = rawDocuments.map(raw => ({
        id: Number(raw.id),
        path: String(raw.path),
        meta: String(raw.meta),
        created_at: String(raw.created_at),
        updated_at: String(raw.updated_at)
      }));

      // Parse meta JSON strings and filter based on content
      const formattedDocuments = documents
        .map(doc => ({
          ...doc,
          meta: JSON.parse(doc.meta)
        }))
        .filter(doc => {
          // Additional filtering on parsed meta fields
          const meta = doc.meta as Record<string, unknown>;
          return Object.values(meta).some(value => 
            value && String(value).toLowerCase().includes(searchQuery)
          );
        });

      ctx.response.body = formattedDocuments;
    } else {
      // If no search query, return all documents
      stmt = db.prepare("SELECT id, path, meta, created_at, updated_at FROM documents ORDER BY created_at DESC");
      const rawDocuments = await stmt.all() as Record<string, unknown>[];
      stmt.finalize();

      // Transform raw documents into properly typed Document objects
      const documents: Document[] = rawDocuments.map(raw => ({
        id: Number(raw.id),
        path: String(raw.path),
        meta: String(raw.meta),
        created_at: String(raw.created_at),
        updated_at: String(raw.updated_at)
      }));

      // Parse meta JSON strings
      const formattedDocuments = documents.map(doc => ({
        ...doc,
        meta: JSON.parse(doc.meta)
      }));

      ctx.response.body = formattedDocuments;
    }
  } catch (error) {
    logger.error("Error fetching documents:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.post("/api/documents/:id/reset", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    const db = await DatabaseConnection.getInstance();
    
    // First get the current meta
    const doc = await db.prepare("SELECT meta FROM documents WHERE id = ?").get(id) as { meta: string } | undefined;
    if (!doc) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    // Parse meta, update llmProcessed, and stringify back
    const meta = JSON.parse(doc.meta);
    meta.llmProcessed = false;
    
    // Update the document
    const stmt = db.prepare("UPDATE documents SET content = NULL, meta = ? WHERE id = ?");
    const result = await stmt.run(JSON.stringify(meta), id);
    stmt.finalize();

    if (result === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = { message: "Document reset successfully" };
  } catch (error) {
    logger.error("Error resetting document:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.get("/api/document/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    const db = await DatabaseConnection.getInstance();
    const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
    const document = await stmt.get(id) as Document | undefined;
    stmt.finalize();

    if (!document) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    try {
      // Check if file exists
      const fileInfo = await Deno.stat(document.path);
      if (!fileInfo.isFile) {
        throw new Error("Not a file");
      }

      // Set appropriate headers
      ctx.response.headers.set("Content-Type", "application/pdf");
      const filename = document.path.split("/").pop() || '';
      const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
      ctx.response.headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodedFilename}`); 

      // Stream the file
      const file = await Deno.open(document.path);
      ctx.response.body = file.readable;
    } catch (error) {
      logger.error(`Error reading PDF file at path '${document.path}':`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: document.path,
        exists: await Deno.stat(document.path).then(() => true).catch(() => false)
      });
      ctx.response.status = 404;
      ctx.response.body = { error: "PDF file not found or cannot be accessed" };
    }
  } catch (error) {
    logger.error("Error fetching document:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Update document metadata
router.patch("/api/document/:id/meta", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    // Get request body
    const result = ctx.request.body();
    if (result.type !== "json") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Request body must be JSON" };
      return;
    }

    const updates = await result.value;
    
    // Get current document
    const db = await DatabaseConnection.getInstance();
    const currentDoc = await db.prepare("SELECT meta FROM documents WHERE id = ?").get(id) as { meta: string } | undefined;
    
    if (!currentDoc) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    // Parse current metadata
    let currentMeta;
    try {
      currentMeta = JSON.parse(currentDoc.meta);
    } catch (e) {
      currentMeta = {};
    }

    // Merge updates with current metadata
    const newMeta = {
      ...currentMeta,
      ...updates,
      // Update lastModified timestamp
      lastModified: new Date().toISOString()
    };

    // Update the document
    await db.prepare(
      "UPDATE documents SET meta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run([JSON.stringify(newMeta), id]);

    // Return updated document
    const dbResult = await db.prepare(
      "SELECT id, path, meta, created_at, updated_at FROM documents WHERE id = ?"
    ).get(id) as { id: number; path: string; meta: string; created_at: string; updated_at: string };
    
    if (!dbResult) {
      throw new Error(`Document with id ${id} not found`);
    }

    const updatedDoc: Document = {
      id: dbResult.id,
      path: dbResult.path,
      meta: dbResult.meta,
      // content: null, // Since we're not selecting content in the query
      created_at: dbResult.created_at,
      updated_at: dbResult.updated_at
    };

    ctx.response.body = {
      ...updatedDoc,
      meta: JSON.parse(updatedDoc.meta)
    };
  } catch (error) {
    logger.error("Error updating document metadata:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Reset document for reprocessing
router.post("/api/documents/:id/reset", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    const db = await DatabaseConnection.getInstance();
    
    // Update the document's meta to mark it as unprocessed
    const stmt = db.prepare(
      "UPDATE documents SET meta = json_set(meta, '$.llmProcessed', json('false')) WHERE id = ?"
    );
    
    const result = await stmt.run([id]);
    stmt.finalize();

    if (typeof result === 'number' && result === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Document not found" };
      return;
    }

    ctx.response.body = { message: "Document reset successfully" };
  } catch (error) {
    logger.error("Error resetting document:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

export { router as documentsRouter };
