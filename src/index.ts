import "reflect-metadata";
import express from "express";
import { AppDataSource } from "./data-source";
import identifyRoute from "./routes/identify";

const app = express();
app.use(express.json());

// Helpful for quick checks
app.get("/", (_req, res) => res.send("Bitespeed API is running. Use POST /identify"));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ✅ Respect cloud-provided PORT (e.g., Render), fallback to 3000 locally
const PORT = Number(process.env.PORT) || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log("✅ Database connected");
    app.use("/identify", identifyRoute);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });
