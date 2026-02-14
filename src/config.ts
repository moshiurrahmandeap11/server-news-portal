// config.ts
import dotenv from "dotenv";
dotenv.config();

interface Config {
  jwtSecret: string;
  jwtExpiresIn: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPass: string;
  dbName: string;
  port: number;
}

function getConfig(): Config {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN;
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT;
  const dbUser = process.env.DB_USER;
  const dbPass = process.env.DB_PASS;
  const dbName = process.env.DB_NAME;
  const port = process.env.PORT;

  if (!jwtSecret || !jwtExpiresIn) {
    throw new Error("JWT_SECRET or JWT_EXPIRES_IN is not defined in .env");
  }

  if (!dbHost || !dbPort || !dbUser || !dbPass || !dbName || !port) {
    throw new Error("Database configuration is incomplete in .env");
  }

  return {
    jwtSecret,
    jwtExpiresIn,
    dbHost,
    dbPort: parseInt(dbPort, 10),
    dbUser,
    dbPass,
    dbName,
    port: parseInt(port, 10),
  };
}

export const config = getConfig();
