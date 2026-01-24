import { FastifyInstance } from "fastify";
import { logInfo } from "../modules/config/logger.js";

export const registerWalletRoutes = async (app: FastifyInstance) => {
  app.post("/wallet/top-up", async (request) => {
    logInfo("Wallet top up", request.body);
    return { status: "queued" };
  });
};
