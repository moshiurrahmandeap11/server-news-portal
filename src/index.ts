import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { connectDB } from "./db/db.js";

dotenv.config();

// import
import basicSettings from "./routes/settingsRoute/basic.js";
import usersData from "./routes/usersRoute/users.js";

const corsOptions = {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // credentials: false
};

const app = express();
const port = process.env.PORT;

// json parsing middleware
app.use(express.json());
app.use(cors(corsOptions));
// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// connect with postgres
connectDB();

// api endpoints
app.use("/api/users", usersData);
app.use("/api/basic-settings", basicSettings);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from typeScript Universe");
});
app.listen(port, () => {
  console.log(`news portal server running as http://localhost:${port}`);
});
