require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUD_KEY_NAME || "dlf94abdo",
  api_key: process.env.CLOUD_API_KEY || "999677219773141",
  api_secret: process.env.CLOUD_API_SECRET || "oOcKYpwdVsOVTa7fP13YAFnpuUo",
});

console.log("Cloudinary configured successfully");

class CloudinaryService {
  constructor() {
    this.cloudinary = cloudinary;
  }

  async uploadReceipt(file, transactionId) {
    try {
      if (!process.env.CLOUD_KEY_NAME) {
        return {
          success: false,
          error:
            "Cloudinary not configured. Please add CLOUD_KEY_NAME, CLOUD_API_KEY, and CLOUD_API_SECRET to your .env file",
        };
      }

      const result = await new Promise((resolve, reject) => {
        const uploadStream = this.cloudinary.uploader.upload_stream(
          {
            folder: "bnb-receipts",
            public_id: `receipt_${transactionId}_${Date.now()}`,
            resource_type: "auto",
            transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(file.buffer);
      });

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
      };
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async deleteReceipt(publicId) {
    try {
      const result = await this.cloudinary.uploader.destroy(publicId);
      return {
        success: result.result === "ok",
        result: result.result,
      };
    } catch (error) {
      console.error("Cloudinary delete error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async generateThumbnail(publicId) {
    try {
      return this.cloudinary.url(publicId, {
        width: 200,
        height: 200,
        crop: "fill",
        quality: "auto",
        fetch_format: "auto",
      });
    } catch (error) {
      console.error("Thumbnail generation error:", error);
      return null;
    }
  }

  async verifyReceipt(url) {
    try {
      const publicId = this.extractPublicId(url);
      const result = await this.cloudinary.api.resource(publicId);

      return {
        success: true,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
        createdAt: result.created_at,
        isImage: ["jpg", "jpeg", "png", "gif", "webp"].includes(
          result.format.toLowerCase()
        ),
        isPDF: result.format.toLowerCase() === "pdf",
      };
    } catch (error) {
      console.error("Receipt verification error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  extractPublicId(url) {
    const parts = url.split("/");
    const filename = parts[parts.length - 1];
    return filename.split(".")[0];
  }

  generateOptimizedUrl(publicId, options = {}) {
    return this.cloudinary.url(publicId, {
      quality: "auto",
      fetch_format: "auto",
      ...options,
    });
  }

  async getStorageStats() {
    try {
      const result = await this.cloudinary.api.usage();
      return {
        success: true,
        plan: result.plan,
        objects: result.objects,
        bandwidth: result.bandwidth,
        storage: result.storage,
        requests: result.requests,
        resources: result.resources,
        derived_resources: result.derived_resources,
      };
    } catch (error) {
      console.error("Storage stats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log("File type rejected:", file.mimetype);
      cb(
        new Error(
          "Invalid file type. Only images (JPG, PNG, GIF, WebP) and PDFs are allowed."
        ),
        false
      );
    }
  },
});

module.exports = {
  cloudinaryService: new CloudinaryService(),
  upload,
};
