import fs from "fs";
import { GoogleAuth } from "google-auth-library";

type UploadFolder = "media" | string;

const bucketName =
  process.env.GCS_BUCKET_NAME ||
  process.env.GOOGLE_CLOUD_BUCKET ||
  process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
  process.env.GOOGLE_STORAGE_BUCKET;

const clientEmail =
  process.env.GCS_CLIENT_EMAIL ||
  process.env.GOOGLE_CLIENT_EMAIL ||
  process.env.GOOGLE_CLOUD_CLIENT_EMAIL;

const privateKey = (
  process.env.GCS_PRIVATE_KEY ||
  process.env.GOOGLE_PRIVATE_KEY ||
  process.env.GOOGLE_CLOUD_PRIVATE_KEY ||
  ""
).replace(/\\n/g, "\n");

const projectId =
  process.env.GCS_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GOOGLE_PROJECT_ID;

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const fileCredentials =
  credentialsPath && fs.existsSync(credentialsPath)
    ? JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
    : null;

const authClient = fileCredentials
  ? new GoogleAuth({
      credentials: fileCredentials,
      scopes: ["https://www.googleapis.com/auth/devstorage.full_control"],
    })
  : clientEmail && privateKey
    ? new GoogleAuth({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ["https://www.googleapis.com/auth/devstorage.full_control"],
      })
    : null;

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

function ensureStorageConfig() {
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is required for Google Cloud Storage");
  }

  if (!authClient) {
    throw new Error("Google Cloud credentials are required for Google Cloud Storage");
  }

  return { bucketName, authClient };
}

async function getAccessToken() {
  const { authClient } = ensureStorageConfig();
  const token = await authClient.getAccessToken();

  if (!token) {
    throw new Error("Failed to get Google Cloud access token");
  }

  return token;
}

function objectApiUrl(objectName: string, altMedia = false) {
  const { bucketName } = ensureStorageConfig();
  const encodedObjectName = encodeURIComponent(objectName);
  const baseUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodedObjectName}`;

  return altMedia ? `${baseUrl}?alt=media` : baseUrl;
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
  const objectName = `${cleanFolder}/${filename}`;
  const contentType = file.type || "application/octet-stream";
  const accessToken = await getAccessToken();
  const boundary = `gcs-upload-${Date.now()}-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: objectName,
    cacheControl: "public, max-age=31536000, immutable",
    contentType,
  });

  const uploadBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const { bucketName } = ensureStorageConfig();
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucketName,
  )}/o?uploadType=multipart`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(uploadBody.length),
    },
    body: uploadBody,
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.error?.message ||
        `Google Cloud Storage upload failed with status ${response.status}`,
    );
  }

  return {
    filename,
    objectName,
    contentType,
    size: bytes.length,
  };
}

export async function fetchStoredObject(objectName: string) {
  const accessToken = await getAccessToken();
  return fetch(objectApiUrl(objectName, true), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function deleteStoredObject(objectName: string) {
  const accessToken = await getAccessToken();
  const response = await fetch(objectApiUrl(objectName), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.error?.message ||
        `Google Cloud Storage delete failed with status ${response.status}`,
    );
  }
}
