import express from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

// Register routes synchronously for Vercel
registerRoutes(httpServer, app);

export default app;
