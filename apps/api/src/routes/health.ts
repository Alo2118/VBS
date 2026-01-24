import { FastifyInstance } from "fastify";

export const registerHealthRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({ status: "ok" }));
};
