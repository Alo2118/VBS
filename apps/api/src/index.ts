import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMemberRoutes } from "./routes/members.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerWalletRoutes } from "./routes/wallet.js";
import { registerBarRoutes } from "./routes/bar.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerSystemRoutes } from "./routes/system.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? true
});

await registerHealthRoutes(app);
await registerMemberRoutes(app);
await registerBookingRoutes(app);
await registerWalletRoutes(app);
await registerBarRoutes(app);
await registerNotificationRoutes(app);
await registerSystemRoutes(app);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error, "Server failed to start");
  process.exit(1);
});
