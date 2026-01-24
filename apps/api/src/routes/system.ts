import { FastifyInstance } from "fastify";
import { roles } from "@vbs/shared";

export const registerSystemRoutes = async (app: FastifyInstance) => {
  app.get("/system/roles", async () => ({ data: roles }));
};
