import "reflect-metadata";
import express from "express";
import { AppDataSource } from "./data-source";
import identifyRoute from "./routes/identify";

const app = express();
app.use(express.json());

AppDataSource.initialize()
  .then(() => {
    console.log("✅ Database connected");
    app.use("/identify", identifyRoute);
    app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err);
  });
