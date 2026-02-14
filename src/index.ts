import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { connectDB } from "./db/db.js";

dotenv.config();

const app = express();
const port = process.env.PORT;

// json parsing middleware
app.use(express.json());

// connect with postgres
connectDB();

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from typeScript Universe");
});
app.listen(port, () => {
  console.log(`news portal server running as http://localhost:${port}`);
});
