import { Router, Context } from "oak";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { createLogger } from '../lib/logger.ts';
import { currentConfigFolder } from '../lib/config.ts';

// Maximum number of lines to return
const MAX_LINES = 1000;
// Read chunk size in bytes
const CHUNK_SIZE = 8192;

const logger = createLogger('api:logs');
const router = new Router();

router.get("/api/logs", async (ctx: Context) => {
    const component = ctx.request.url.searchParams.get('component');
    const level = ctx.request.url.searchParams.get('level');
    const from = ctx.request.url.searchParams.get('from');
    const to = ctx.request.url.searchParams.get('to');
    const count = ctx.request.url.searchParams.get('count');
    
    // Use count if specified and valid, otherwise use MAX_LINES
    const limit = count ? Math.min(parseInt(count) || MAX_LINES, MAX_LINES) : MAX_LINES;
    try {
        const configPath = await currentConfigFolder();
        const logPath = join(configPath, "system.log");

        try {
            const file = await Deno.open(logPath);
            const fileInfo = await file.stat();
            const fileSize = fileInfo.size;

            // Store lines we find
            const lines: string[] = [];
            let position = fileSize;
            let foundLines = 0;

            // Read the file backwards in chunks
            while (position > 0 && foundLines < limit) {
                const chunkSize = Math.min(CHUNK_SIZE, position);
                position -= chunkSize;

                // Read a chunk from the current position
                const buffer = new Uint8Array(chunkSize);
                await file.seek(position, Deno.SeekMode.Start);
                await file.read(buffer);

                // Convert to string and split into lines
                let chunk = new TextDecoder().decode(buffer);
                let chunkLines = chunk.split('\n');

                // If this isn't the first chunk and we have lines
                if (position > 0 && lines.length > 0) {
                    // Combine the last line of this chunk with the first line of our collection
                    chunkLines[chunkLines.length - 1] += lines[0];
                    lines[0] = chunkLines[chunkLines.length - 1];
                    chunkLines.pop();
                }

                // Add lines to our collection
                const filteredLines = chunkLines.filter(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return false;

                    const regex = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[(?<level>\w+)]\s+(?<component>.+?)(?=:\s+):\s+(?<message>.+)$/;
                    const match = trimmedLine.match(regex);
                    if (!match?.groups) return false;

                    const { timestamp, level: logLevel, component: logComponent } = match.groups;

                    // Filter by component if specified
                    if (component && logComponent !== component) return false;

                    // Filter by level if specified
                    if (level && logLevel !== level.toUpperCase()) return false;

                    // Filter by timerange if specified
                    if (from && new Date(timestamp) < new Date(from)) return false;
                    if (to && new Date(timestamp) > new Date(to)) return false;

                    return true;
                });
                
                lines.unshift(...filteredLines);
                foundLines = lines.length;
            }

            file.close();

            // Take only the requested number of lines
            const lastLines = lines.slice(-limit);
            ctx.response.headers.set("Content-Type", "application/json");
            ctx.response.body = { lines: lastLines };
            logger.debug(`Retrieved last ${limit} system logs`);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                ctx.response.status = 404;
                ctx.response.body = { error: "Log file not found" };
                logger.warn('Log file not found', { path: logPath });
            } else {
                throw error;
            }
        }
    } catch (error: unknown) {
        logger.error('Failed to retrieve logs', { error: error instanceof Error ? error.message : String(error) });
        ctx.response.status = 500;
        ctx.response.body = { error: "Failed to retrieve logs" };
    }
});

export default router;
