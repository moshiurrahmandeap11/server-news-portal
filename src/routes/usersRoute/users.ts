import bcrypt from "bcrypt";
import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import pool from "../../db/db.js";

const router = Router();
const SALT_ROUNDS = 10;

// add new user data
router.post("/registration", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(500).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // check if user already exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // insert user
    const query = `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, updated_at`;

    const values = [name, email.toLowerCase(), hashedPassword, role || "user"];
    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: "User Registered Successfully",
      data: result.rows[0],
    });
  } catch (err: unknown) {
    console.error("registration failed error: ", err);
    res.status(500).json({
      success: false,
      message: "server error",
    });
  }
});

// login system with jwt and postgres
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // fetch user by email
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Credentials",
      });
    }

    const user = result.rows[0];

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid Credentials",
      });
    }

    // generate JWT - use config values
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] },
    );

    res.status(200).json({
      success: true,
      message: "Login Sucessful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: unknown) {
    console.error("Login failed error", err);
    res.status(500).json({
      success: false,
      message: "server error",
    });
  }
});

// get all users data from postgres
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.status(200).json({
      success: true,
      message: "all data fetched from postgres successfully",
      data: result.rows,
    });
  } catch (err: unknown) {
    console.error("Fetching all user data error", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// get single user by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query =
      "SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1";
    const values = [id];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Single user data fetched successfully",
      data: result.rows[0],
    });
  } catch (err: unknown) {
    console.error("Single user data fetching error", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// update user by ID
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    // check if user exists
    const userCheck = await pool.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (email) {
      const emailCheck = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND id != $2",
        [email.toLowerCase(), id],
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email Already exists for another user",
        });
      }
    }

    let updateFields = [];
    let values = [];
    let paramCounter = 1;

    if (name) {
      updateFields.push(`name = $${paramCounter}`);
      values.push(name);
      paramCounter++;
    }

    if (email) {
      updateFields.push(`email = $${paramCounter}`);
      values.push(email.toLowerCase());
      paramCounter++;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      updateFields.push(`password = $${paramCounter}`);
      values.push(hashedPassword);
      paramCounter++;
    }

    if (role) {
      updateFields.push(`role = $${paramCounter}`);
      values.push(role);
      paramCounter++;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);

    const query = `
        UPDATE users
        SET ${updateFields.join(", ")}  
        WHERE id = $${paramCounter}
        RETURNING id, name, email , role, created_at, updated_at
        `;

    const result = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: result.rows[0],
    });
  } catch (err: unknown) {
    console.error("User update error", err);
    res.status(500).json({
      success: false,
      message: "server error",
    });
  }
});

// delete user
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const userCheck = await pool.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const query = "DELETE FROM users WHERE id = $1 RETURNING id, name, email";
    const result = await pool.query(query, [id]);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: result.rows[0],
    });
  } catch (err: unknown) {
    console.error("User delete error", err);
    res.status(500).json({
      success: false,
      message: "server error",
    });
  }
});

export default router;
