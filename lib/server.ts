import { Application, isHttpError, send, join, dirname, fromFileUrl } from "../deps.ts";
import { createLogger } from './logger.ts';
import { openBrowser } from '../utils/openBrowser.ts';
import { ModelDownloader } from './model-downloader.ts';

const logger = createLogger('server');
import configRouter from '../api/config.ts';
import logsRouter from '../api/logs.ts';
import { documentsRouter } from '../api/documents.ts';
import previewRouter from '../api/preview.ts';
import { modelsRouter } from '../api/models.ts';
export async function startServer(port: number = 9493) {
    const app = new Application();

    // Import API routes
    app.use(configRouter.routes());
    app.use(configRouter.allowedMethods());
    app.use(logsRouter.routes());
    app.use(logsRouter.allowedMethods());
    app.use(documentsRouter.routes());
    app.use(documentsRouter.allowedMethods());
    app.use(previewRouter.routes());
    app.use(previewRouter.allowedMethods());
    app.use(modelsRouter.routes());
    app.use(modelsRouter.allowedMethods());

    // Initialize the model downloader
    await ModelDownloader.getInstance().init();

    // Error handler middleware
    app.use(async (ctx, next) => {
        try {
            logger.debug('Incoming request', {
                method: ctx.request.method,
                url: ctx.request.url.toString(),
                headers: Object.fromEntries(ctx.request.headers.entries())
            });
            await next();
        } catch (err: unknown) {
            if (err instanceof Error) {
                logger.error('Request error', { error: err.message, stack: err.stack });
                
                if (isHttpError(err)) {
                    ctx.response.status = err.status;
                    ctx.response.body = { error: err.message };
                    logger.warn(`HTTP ${err.status} error`, { message: err.message });
                } else {
                    ctx.response.status = 500;
                    ctx.response.body = { error: 'Internal server error' };
                    logger.error('Internal server error', { error: err.message });
                }
            } else {
                // Handle non-Error objects
                logger.error('Unknown error type', { error: String(err) });
                ctx.response.status = 500;
                ctx.response.body = { error: 'Internal server error' };
            }
        }
    });

    // Logger middleware
    app.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        const status = ctx.response.status;
        
        if (status >= 400) {
            logger.warn(`${ctx.request.method} ${ctx.request.url} ${status} - ${ms}ms`);
        } else {
            logger.info(`${ctx.request.method} ${ctx.request.url} ${status} - ${ms}ms`);
        }

        logger.debug('Response details', {
            status,
            duration: ms,
            responseHeaders: Object.fromEntries(ctx.response.headers.entries())
        });
    });

    // Serve static files from UI build directory
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const uiDistPath = join(currentDir, '..', 'ui', 'dist');

    // Serve static files
    app.use(async (ctx) => {
        const path = ctx.request.url.pathname;
        try {
            await send(ctx, path, {
                root: uiDistPath,
                index: "index.html",
            });
        } catch {
            // If file not found, serve index.html for client-side routing
            await send(ctx, "/", {
                root: uiDistPath,
                index: "index.html",
            });
        }
    });
    // Start the server
    logger.info(`Starting server on port ${port}...`);

    app.addEventListener('listen', async () => {
        const url = `http://localhost:${port}`;
        logger.info(`Server is running on ${url}`);
        logger.debug('Server configuration', { 
            port,
            environment: Deno.env.get('DENO_ENV') || 'development',
            debugEnabled: Boolean(Deno.env.get('DEBUG'))
        });

        // Only open browser if NO_BROWSER environment variable is not set
        if (!Deno.env.get('NO_BROWSER')) {
            await openBrowser(url);
        }
    });

    await app.listen({ port });
    return app;
}
