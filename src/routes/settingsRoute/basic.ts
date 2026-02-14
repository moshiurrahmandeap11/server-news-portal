import { Request, Response, Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import pool from "../../db/db.js";

const router = Router();

// Type for authenticated request
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = ["./uploads/settings/logo", "./uploads/settings/favicon"];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

// Configure storage for logo
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/settings/logo");
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const fileName = `logo-${uniqueId}${fileExtension}`;
    cb(null, fileName);
  },
});

// Configure storage for favicon
const faviconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/settings/favicon");
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const fileName = `favicon-${uniqueId}${fileExtension}`;
    cb(null, fileName);
  },
});

// File filter for images
const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed") as any, false);
  }
};

// Multer upload middleware
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for logo
  fileFilter: imageFileFilter,
}).single("logo");

const uploadFavicon = multer({
  storage: faviconStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB limit for favicon
  fileFilter: imageFileFilter,
}).single("favicon");

// Helper function to delete old file
const deleteOldFile = (filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log("Old file deleted:", filePath);
    } catch (error) {
      console.error("Error deleting old file:", error);
    }
  }
};

// GET /api/basic-settings - Get all settings (usually there will be only one row)
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM basic_settings ORDER BY id DESC LIMIT 1",
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No settings found",
      });
    }

    // Add full URLs for logo and favicon
    const settings = result.rows[0];
    if (settings.logo_url) {
      settings.logo_url = `${req.protocol}://${req.get("host")}${settings.logo_url}`;
    }
    if (settings.favicon_url) {
      settings.favicon_url = `${req.protocol}://${req.get("host")}${settings.favicon_url}`;
    }

    res.status(200).json({
      success: true,
      message: "Basic settings fetched successfully",
      data: settings,
    });
  } catch (err: unknown) {
    console.error("Basic settings fetching error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// POST /api/basic-settings/logo - Upload logo only
router.post("/logo", uploadLogo, async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No logo file uploaded",
      });
    }

    // Get current settings to delete old logo
    const currentSettings = await pool.query(
      "SELECT logo_url FROM basic_settings ORDER BY id DESC LIMIT 1",
    );

    const logoPath = `/uploads/settings/logo/${file.filename}`;

    // Update settings with new logo
    const result = await pool.query(
      `UPDATE basic_settings 
       SET logo_url = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = (SELECT id FROM basic_settings ORDER BY id DESC LIMIT 1)
       RETURNING *`,
      [logoPath],
    );

    // If update successful and there was an old logo, delete it
    if (result.rows.length > 0 && currentSettings.rows.length > 0) {
      const oldLogoPath = currentSettings.rows[0].logo_url;
      if (oldLogoPath && oldLogoPath !== logoPath) {
        const fullOldPath = path.join(process.cwd(), oldLogoPath);
        deleteOldFile(fullOldPath);
      }
    }

    res.status(200).json({
      success: true,
      message: "Logo uploaded successfully",
      data: {
        logo_url: `${req.protocol}://${req.get("host")}${logoPath}`,
      },
    });
  } catch (err: unknown) {
    console.error("Logo upload error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// POST /api/basic-settings/favicon - Upload favicon only
router.post(
  "/favicon",
  uploadFavicon,
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No favicon file uploaded",
        });
      }

      // Get current settings to delete old favicon
      const currentSettings = await pool.query(
        "SELECT favicon_url FROM basic_settings ORDER BY id DESC LIMIT 1",
      );

      const faviconPath = `/uploads/settings/favicon/${file.filename}`;

      // Update settings with new favicon
      const result = await pool.query(
        `UPDATE basic_settings 
       SET favicon_url = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = (SELECT id FROM basic_settings ORDER BY id DESC LIMIT 1)
       RETURNING *`,
        [faviconPath],
      );

      // If update successful and there was an old favicon, delete it
      if (result.rows.length > 0 && currentSettings.rows.length > 0) {
        const oldFaviconPath = currentSettings.rows[0].favicon_url;
        if (oldFaviconPath && oldFaviconPath !== faviconPath) {
          const fullOldPath = path.join(process.cwd(), oldFaviconPath);
          deleteOldFile(fullOldPath);
        }
      }

      res.status(200).json({
        success: true,
        message: "Favicon uploaded successfully",
        data: {
          favicon_url: `${req.protocol}://${req.get("host")}${faviconPath}`,
        },
      });
    } catch (err: unknown) {
      console.error("Favicon upload error:", err);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },
);

// POST /api/basic-settings - Create new settings
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      site_name,
      tagline,
      contact_email,
      facebook_url,
      x_url,
      instagram_url,
      meta_description,
      meta_keywords,
      meta_author,
      google_analytics_id,
      contact_phone,
      contact_address,
      copyright_text,
      maintenance_mode,
    } = req.body;

    // Validation
    if (!site_name) {
      return res.status(400).json({
        success: false,
        message: "Site name is required",
      });
    }

    // Check if settings already exist
    const existingSettings = await pool.query(
      "SELECT id FROM basic_settings LIMIT 1",
    );

    if (existingSettings.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Settings already exist. Use PUT to update.",
      });
    }

    const createdBy = req.user?.id || null;
    const updatedBy = req.user?.id || null;

    const query = `
      INSERT INTO basic_settings (
        site_name, tagline, contact_email,
        facebook_url, x_url, instagram_url, meta_description,
        meta_keywords, meta_author, google_analytics_id, contact_phone,
        contact_address, copyright_text, maintenance_mode,
        created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      site_name,
      tagline || null,
      contact_email || null,
      facebook_url || null,
      x_url || null,
      instagram_url || null,
      meta_description || null,
      meta_keywords || null,
      meta_author || null,
      google_analytics_id || null,
      contact_phone || null,
      contact_address || null,
      copyright_text || null,
      maintenance_mode || false,
      createdBy,
      updatedBy,
    ];

    const result = await pool.query(query, values);

    // Add full URLs
    const settings = result.rows[0];
    if (settings.logo_url) {
      settings.logo_url = `${req.protocol}://${req.get("host")}${settings.logo_url}`;
    }
    if (settings.favicon_url) {
      settings.favicon_url = `${req.protocol}://${req.get("host")}${settings.favicon_url}`;
    }

    res.status(201).json({
      success: true,
      message: "Basic settings created successfully",
      data: settings,
    });
  } catch (err: unknown) {
    console.error("Basic settings creation error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// PUT /api/basic-settings/:id - Update settings
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      site_name,
      tagline,
      contact_email,
      facebook_url,
      x_url,
      instagram_url,
      meta_description,
      meta_keywords,
      meta_author,
      google_analytics_id,
      contact_phone,
      contact_address,
      copyright_text,
      maintenance_mode,
    } = req.body;

    // Check if settings exist
    const checkExist = await pool.query(
      "SELECT * FROM basic_settings WHERE id = $1",
      [id],
    );

    if (checkExist.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    const updatedBy = req.user?.id || null;

    const query = `
      UPDATE basic_settings SET
        site_name = COALESCE($1, site_name),
        tagline = COALESCE($2, tagline),
        contact_email = COALESCE($3, contact_email),
        facebook_url = COALESCE($4, facebook_url),
        x_url = COALESCE($5, x_url),
        instagram_url = COALESCE($6, instagram_url),
        meta_description = COALESCE($7, meta_description),
        meta_keywords = COALESCE($8, meta_keywords),
        meta_author = COALESCE($9, meta_author),
        google_analytics_id = COALESCE($10, google_analytics_id),
        contact_phone = COALESCE($11, contact_phone),
        contact_address = COALESCE($12, contact_address),
        copyright_text = COALESCE($13, copyright_text),
        maintenance_mode = COALESCE($14, maintenance_mode),
        updated_by = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *
    `;

    const values = [
      site_name,
      tagline,
      contact_email,
      facebook_url,
      x_url,
      instagram_url,
      meta_description,
      meta_keywords,
      meta_author,
      google_analytics_id,
      contact_phone,
      contact_address,
      copyright_text,
      maintenance_mode,
      updatedBy,
      id,
    ];

    const result = await pool.query(query, values);

    // Add full URLs
    const settings = result.rows[0];
    if (settings.logo_url) {
      settings.logo_url = `${req.protocol}://${req.get("host")}${settings.logo_url}`;
    }
    if (settings.favicon_url) {
      settings.favicon_url = `${req.protocol}://${req.get("host")}${settings.favicon_url}`;
    }

    res.status(200).json({
      success: true,
      message: "Basic settings updated successfully",
      data: settings,
    });
  } catch (err: unknown) {
    console.error("Basic settings update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// GET /api/basic-settings/public/info - Public endpoint for frontend
router.get("/public/info", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        site_name, 
        tagline, 
        logo_url, 
        favicon_url, 
        facebook_url, 
        x_url, 
        instagram_url,
        contact_email,
        contact_phone,
        contact_address,
        copyright_text,
        maintenance_mode
      FROM basic_settings 
      ORDER BY id DESC 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    // Add full URLs
    const settings = result.rows[0];
    if (settings.logo_url) {
      settings.logo_url = `${req.protocol}://${req.get("host")}${settings.logo_url}`;
    }
    if (settings.favicon_url) {
      settings.favicon_url = `${req.protocol}://${req.get("host")}${settings.favicon_url}`;
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err: unknown) {
    console.error("Public settings fetching error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
