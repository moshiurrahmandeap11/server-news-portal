import { Request, Response, Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/db.js";

const router = Router();

// Define file types
interface UploadedFile extends Express.Multer.File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

// Allowed file types
const allowedFileTypes = {
  images: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    "image/avif",
  ],
  videos: [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/webm",
    "video/3gpp",
    "video/x-flv",
  ],
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
    "text/plain",
    "text/csv",
    "application/rtf",
    "application/vnd.oasis.opendocument.text", // odt
    "application/vnd.oasis.opendocument.spreadsheet", // ods
    "application/vnd.oasis.opendocument.presentation", // odp
  ],
  others: [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/x-tar",
    "application/gzip",
  ],
};

// Flatten all allowed types for validation
const ALLOWED_MIME_TYPES = [
  ...allowedFileTypes.images,
  ...allowedFileTypes.videos,
  ...allowedFileTypes.documents,
  ...allowedFileTypes.others,
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Create upload directories if they don't exist
const createUploadDirs = () => {
  const dirs = [
    "./uploads",
    "./uploads/images",
    "./uploads/videos",
    "./uploads/documents",
    "./uploads/others",
    "./uploads/temp",
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "./uploads/others";

    if (allowedFileTypes.images.includes(file.mimetype)) {
      uploadPath = "./uploads/images";
    } else if (allowedFileTypes.videos.includes(file.mimetype)) {
      uploadPath = "./uploads/videos";
    } else if (allowedFileTypes.documents.includes(file.mimetype)) {
      uploadPath = "./uploads/documents";
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const sanitizedFileName = file.originalname
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase()
      .substring(0, 50);

    const fileName = `${Date.now()}-${uniqueId}-${sanitizedFileName}${fileExtension}`;
    cb(null, fileName);
  },
});

// File filter function
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`) as any, false);
  }
};

// Multer upload middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter,
});

// Type for authenticated request
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Helper function to get file category
const getFileCategory = (mimetype: string): string => {
  if (allowedFileTypes.images.includes(mimetype)) return "image";
  if (allowedFileTypes.videos.includes(mimetype)) return "video";
  if (allowedFileTypes.documents.includes(mimetype)) return "document";
  return "other";
};

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Single file upload
router.post(
  "/single",
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file as UploadedFile;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const fileCategory = getFileCategory(file.mimetype);
      const fileSize = formatFileSize(file.size);
      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${fileCategory}s/${file.filename}`;

      // Save file info to database (optional)
      const query = `
      INSERT INTO uploads (
        filename, original_name, mime_type, size, size_formatted,
        path, url, category, uploaded_by, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, filename, original_name, url, category, size_formatted
    `;

      const values = [
        file.filename,
        file.originalname,
        file.mimetype,
        file.size,
        fileSize,
        file.path,
        fileUrl,
        fileCategory,
        req.user?.id || null,
      ];

      const result = await pool.query(query, values);

      res.status(201).json({
        success: true,
        message: "File uploaded successfully",
        data: {
          ...result.rows[0],
          fileUrl,
        },
      });
    } catch (err: unknown) {
      console.error("File upload error:", err);

      if (err instanceof Error) {
        if (err.message.includes("File type not allowed")) {
          return res.status(400).json({
            success: false,
            message: err.message,
          });
        }
        if (err.message.includes("File too large")) {
          return res.status(400).json({
            success: false,
            message: "File size exceeds limit (max 100MB)",
          });
        }
      }

      res.status(500).json({
        success: false,
        message: "Server error during file upload",
      });
    }
  },
);

// Multiple files upload
router.post(
  "/multiple",
  upload.array("files", 10),
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as UploadedFile[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      const uploadedFiles = [];

      for (const file of files) {
        const fileCategory = getFileCategory(file.mimetype);
        const fileSize = formatFileSize(file.size);
        const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${fileCategory}s/${file.filename}`;

        // Save to database
        const query = `
        INSERT INTO uploads (
          filename, original_name, mime_type, size, size_formatted,
          path, url, category, uploaded_by, uploaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id, filename, original_name, url, category, size_formatted
      `;

        const values = [
          file.filename,
          file.originalname,
          file.mimetype,
          file.size,
          fileSize,
          file.path,
          fileUrl,
          fileCategory,
          req.user?.id || null,
        ];

        const result = await pool.query(query, values);
        uploadedFiles.push(result.rows[0]);
      }

      res.status(201).json({
        success: true,
        message: `${uploadedFiles.length} files uploaded successfully`,
        data: uploadedFiles,
        count: uploadedFiles.length,
      });
    } catch (err: unknown) {
      console.error("Multiple files upload error:", err);
      res.status(500).json({
        success: false,
        message: "Server error during file upload",
      });
    }
  },
);

// Upload with custom field names
router.post(
  "/mixed",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "gallery", maxCount: 5 },
    { name: "documents", maxCount: 3 },
    { name: "videos", maxCount: 2 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: UploadedFile[] };
      const uploadedData: Record<string, any> = {};

      for (const [fieldname, fileArray] of Object.entries(files)) {
        uploadedData[fieldname] = [];

        for (const file of fileArray) {
          const fileCategory = getFileCategory(file.mimetype);
          const fileSize = formatFileSize(file.size);
          const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${fileCategory}s/${file.filename}`;

          // Save to database
          const query = `
          INSERT INTO uploads (
            filename, original_name, mime_type, size, size_formatted,
            path, url, category, uploaded_by, uploaded_at, field_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
          RETURNING id, filename, original_name, url, category, size_formatted
        `;

          const values = [
            file.filename,
            file.originalname,
            file.mimetype,
            file.size,
            fileSize,
            file.path,
            fileUrl,
            fileCategory,
            req.user?.id || null,
            fieldname,
          ];

          const result = await pool.query(query, values);
          uploadedData[fieldname].push(result.rows[0]);
        }
      }

      res.status(201).json({
        success: true,
        message: "Files uploaded successfully",
        data: uploadedData,
      });
    } catch (err: unknown) {
      console.error("Mixed upload error:", err);
      res.status(500).json({
        success: false,
        message: "Server error during file upload",
      });
    }
  },
);

// Get all uploads
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT id, filename, original_name, mime_type, size_formatted, 
             url, category, uploaded_at, field_name
      FROM uploads
    `;

    const values: any[] = [];

    if (category) {
      query += ` WHERE category = $1`;
      values.push(category);
    }

    query += ` ORDER BY uploaded_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM uploads ${category ? "WHERE category = $1" : ""}`,
      category ? [category] : [],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(
          parseInt(countResult.rows[0].count) / Number(limit),
        ),
      },
    });
  } catch (err: unknown) {
    console.error("Fetch uploads error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get upload by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM uploads WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err: unknown) {
    console.error("Fetch upload error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Delete upload
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get file info first
    const fileInfo = await pool.query(
      "SELECT path, filename FROM uploads WHERE id = $1",
      [id],
    );

    if (fileInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Delete from database
    await pool.query("DELETE FROM uploads WHERE id = $1", [id]);

    // Delete physical file
    try {
      if (fs.existsSync(fileInfo.rows[0].path)) {
        fs.unlinkSync(fileInfo.rows[0].path);
      }
    } catch (fsError) {
      console.error("Error deleting physical file:", fsError);
    }

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (err: unknown) {
    console.error("Delete upload error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get file statistics
router.get("/stats/summary", async (req: Request, res: Response) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_files,
        SUM(CASE WHEN category = 'image' THEN 1 ELSE 0 END) as total_images,
        SUM(CASE WHEN category = 'video' THEN 1 ELSE 0 END) as total_videos,
        SUM(CASE WHEN category = 'document' THEN 1 ELSE 0 END) as total_documents,
        SUM(CASE WHEN category = 'other' THEN 1 ELSE 0 END) as total_others,
        SUM(size) as total_size_bytes
      FROM uploads
    `);

    res.status(200).json({
      success: true,
      data: {
        ...stats.rows[0],
        total_size_formatted: formatFileSize(
          parseInt(stats.rows[0].total_size_bytes) || 0,
        ),
      },
    });
  } catch (err: unknown) {
    console.error("Stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
