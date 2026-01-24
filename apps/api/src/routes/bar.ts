import { FastifyInstance } from "fastify";
import { logInfo } from "../modules/config/logger.js";

export const registerBarRoutes = async (app: FastifyInstance) => {
  app.post("/bar/sales", async (request) => {
    logInfo("Bar sale", request.body);
    return { status: "recorded" };
  });
};
