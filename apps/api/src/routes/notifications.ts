import { FastifyInstance } from "fastify";
import { notificationConfig } from "../modules/config/environment.js";

export const registerNotificationRoutes = async (app: FastifyInstance) => {
  app.get("/notifications/config", async () => notificationConfig);
};
