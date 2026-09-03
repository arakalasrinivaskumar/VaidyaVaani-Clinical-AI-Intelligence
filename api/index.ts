import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Register routes synchronously for Vercel
registerRoutes(httpServer, app);

// Global Error Handler for Vercel Serverless Function
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Vercel Serverless Function Error:", err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

export default app;
