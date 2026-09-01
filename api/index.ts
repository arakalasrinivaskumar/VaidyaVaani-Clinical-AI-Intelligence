// Edge function route for prescription parsing
export { POST } from "./prescriptions/parse"; // Vercel Edge Runtime

// Keep existing server handler for other endpoints
import express from "express";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));

export default app;