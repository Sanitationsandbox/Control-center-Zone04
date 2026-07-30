import type { UploadApiResponse } from "cloudinary";
import { cloudinary, getPublicIdFromUrl } from "./cloudinary";

type UploadFolder = "media" | string;
export type CloudinaryResourceType = "image" | "video" | "raw";

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

export function resourceTypeFromContentType(contentType: string): CloudinaryResourceType {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return "raw";
}

export async function uploadStoredObject(
  file: File,
  folder: UploadFolder = "media",
  uid = crypto.randomUUID(),
) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const cleanFolder = sanitizePathPart(folder);
  const cleanName = sanitizePathPart(file.name);
  const filename = `${sanitizePathPart(uid)}-${Date.now()}-${cleanName}`;
  const contentType = file.type || "application/octet-stream";
  const resourceType = resourceTypeFromContentType(contentType);

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: cleanFolder,
        public_id: filename,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: false,
      },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve(uploadResult);
      },
    );

    uploadStream.end(bytes);
  });

  return {
    filename,
    objectName: result.secure_url,
    contentType,
    size: bytes.length,
  };
}

export async function fetchStoredObject(objectName: string) {
  return fetch(objectName);
}

export async function deleteStoredObject(
  objectName: string,
  resourceType: CloudinaryResourceType = "image",
) {
  const publicId = getPublicIdFromUrl(objectName);
  if (!publicId) return;

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });

  if (result?.result !== "ok" && result?.result !== "not found") {
    throw new Error(`Cloudinary delete failed: ${result?.result ?? "unknown error"}`);
  }
}
