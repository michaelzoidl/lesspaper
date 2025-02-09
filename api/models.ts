import { Router } from '../deps.ts';
import { ModelDownloader } from '../lib/model-downloader.ts';
import { DatabaseConnection } from '../lib/database.ts';
import { setConfigSetting } from '../lib/config.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('api:models');
const router = new Router();

router.get('/api/models', async (ctx) => {
  const models = await ModelDownloader.getInstance().listModels();
  ctx.response.body = { models };
});

router.post('/api/models/download', async (ctx) => {
  try {
    const body = ctx.request.body();
    if (body.type !== 'json') {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Request body must be JSON' };
      return;
    }

    const { modelUrl } = await body.value;
    if (!modelUrl) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'modelUrl is required' };
      return;
    }

    const downloader = ModelDownloader.getInstance();
    const result = await downloader.downloadModel(modelUrl);

    if (result.success && result.modelPath) {
      // Store the model path in config
      const db = await DatabaseConnection.getInstance();
      await setConfigSetting(db, 'llm_model_path', result.modelPath);
      
      ctx.response.body = { 
        success: true, 
        modelPath: result.modelPath 
      };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { 
        success: false, 
        error: result.error || 'Unknown error occurred' 
      };
    }
  } catch (error) {
    logger.error('Error handling model download:', error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
});

export { router as modelsRouter };
