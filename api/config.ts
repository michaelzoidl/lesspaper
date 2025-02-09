import { Router } from "oak";
import { createLogger } from '../lib/logger.ts';
import { DatabaseConnection } from '../lib/database.ts';
import { setConfigSetting } from '../lib/config.ts';

const logger = createLogger('api:config');
const router = new Router();

router
  .get("/api/config", async (ctx) => {
    try {
      const db = await DatabaseConnection.getInstance();
      const result = await db.prepare(
        "SELECT setting, value FROM config"
      ).all() as Array<{ setting: string; value: string }>;
      
      ctx.response.body = result;
      logger.debug('Retrieved all config settings');
    } catch (error: unknown) {
      logger.error('Failed to get config settings', { error: error instanceof Error ? error.message : String(error) });
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to get config settings" };
    }
  })
  .post("/api/config", async (ctx) => {
    try {
      const body = ctx.request.body();
      if (body.type !== "json") {
        ctx.response.status = 400;
        ctx.response.body = { error: "Request body must be JSON" };
        return;
      }

      const { setting, value } = await body.value;
      if (!setting || !value) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing required fields: setting and value" };
        return;
      }

      const db = await DatabaseConnection.getInstance();
      await setConfigSetting(db, setting, value);
      
      ctx.response.status = 200;
      ctx.response.body = { message: "Config setting updated successfully" };
      logger.info('Updated config setting', { setting, value });
    } catch (error: unknown) {
      logger.error('Failed to update config setting', { error: error instanceof Error ? error.message : String(error) });
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to update config setting" };
    }
  })
  .delete("/api/config", async (ctx) => {
    try {
      const body = ctx.request.body();
      if (body.type !== "json") {
        ctx.response.status = 400;
        ctx.response.body = { error: "Request body must be JSON" };
        return;
      }

      const { setting } = await body.value;
      if (!setting) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing required field: setting" };
        return;
      }

      const db = await DatabaseConnection.getInstance();
      await db.prepare(
        "DELETE FROM config WHERE setting = ?"
      ).run(setting);
      
      ctx.response.status = 200;
      ctx.response.body = { message: "Config setting deleted successfully" };
      logger.info('Deleted config setting', { setting });
    } catch (error: unknown) {
      logger.error('Failed to delete config setting', { error: error instanceof Error ? error.message : String(error) });
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to delete config setting" };
    }
  })
  .delete("/api/config", async (ctx) => {
    try {
      const body = ctx.request.body();
      if (body.type !== "json") {
        ctx.response.status = 400;
        ctx.response.body = { error: "Request body must be JSON" };
        return;
      }

      const { setting } = await body.value;
      if (!setting) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing required field: setting" };
        return;
      }

      const db = await DatabaseConnection.getInstance();
      await db.prepare(
        "DELETE FROM config WHERE setting = ?"
      ).run(setting);
      
      ctx.response.status = 200;
      ctx.response.body = { message: "Config setting deleted successfully" };
      logger.info('Deleted config setting', { setting });
    } catch (error: unknown) {
      logger.error('Failed to delete config setting', { error: error instanceof Error ? error.message : String(error) });
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to delete config setting" };
    }
  });

export default router;
