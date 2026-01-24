import { FastifyInstance } from "fastify";
import { bookingPolicy } from "../modules/config/environment.js";
import { logInfo } from "../modules/config/logger.js";

export const registerBookingRoutes = async (app: FastifyInstance) => {
  app.get("/bookings/policy", async () => bookingPolicy);

  app.post("/bookings", async (request) => {
    logInfo("Create booking request", request.body);
    return { status: "received" };
  });
};
