import { Router } from "oak";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { createLogger } from '../lib/logger.ts';
import { currentConfigFolder } from '../lib/config.ts';

const logger = createLogger('api:logs');
const router = new Router();

router.get("/api/logs", async (ctx) => {
    try {
        const configPath = await currentConfigFolder();
        const logPath = join(configPath, "system.log");

        try {
            const logContent = await Deno.readTextFile(logPath);
            ctx.response.headers.set("Content-Type", "text/plain");
            ctx.response.body = logContent;
            logger.debug('Retrieved system logs');
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
