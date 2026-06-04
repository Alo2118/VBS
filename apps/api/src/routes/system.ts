import { FastifyInstance } from "fastify";
import { ROLES } from "@vbs/shared";

export const registerSystemRoutes = async (app: FastifyInstance) => {
  app.get("/system/roles", async () => ({ data: ROLES }));
};
