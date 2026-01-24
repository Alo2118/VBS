import { FastifyInstance } from "fastify";
import { logInfo } from "../modules/config/logger.js";

export const registerMemberRoutes = async (app: FastifyInstance) => {
  app.get("/members", async () => {
    logInfo("List members request");
    return { data: [] };
  });

  app.post("/members", async (request) => {
    logInfo("Create member request", request.body);
    return { status: "created" };
  });
};
