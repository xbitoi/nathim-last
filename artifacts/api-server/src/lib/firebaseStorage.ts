import admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db, settingsTable } from "@workspace/db";

interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucket: string;
}

let _cachedApp: admin.app.App | null = null;
let _cachedConfigKey = "";

async function loadFirebaseConfig(): Promise<FirebaseConfig | null> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const projectId = (map.firebaseProjectId || "").trim();
  const clientEmail = (map.firebaseClientEmail || "").trim();
  const privateKeyRaw = (map.firebasePrivateKey || "").trim();
  const bucket = (map.firebaseBucket || "").trim();

  if (!projectId || !clientEmail || !privateKeyRaw || !bucket) return null;

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey, bucket };
}

function getOrInitApp(cfg: FirebaseConfig): admin.app.App {
  const key = `${cfg.projectId}|${cfg.clientEmail}|${cfg.bucket}`;
  if (_cachedApp && _cachedConfigKey === key) return _cachedApp;

  if (_cachedApp) {
    _cachedApp.delete().catch(() => {});
    _cachedApp = null;
  }

  _cachedApp = admin.initializeApp(
    {
      credential: admin.credential.cert({
        projectId: cfg.projectId,
        clientEmail: cfg.clientEmail,
        privateKey: cfg.privateKey,
      }),
      storageBucket: cfg.bucket,
    },
    `firebase-${Date.now()}`
  );
  _cachedConfigKey = key;
  return _cachedApp;
}

export function invalidateFirebaseCache() {
  if (_cachedApp) {
    _cachedApp.delete().catch(() => {});
    _cachedApp = null;
    _cachedConfigKey = "";
  }
}

export async function isFirebaseConfigured(): Promise<boolean> {
  const cfg = await loadFirebaseConfig();
  return cfg !== null;
}

export async function getFirebaseUploadUrl(contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
  const cfg = await loadFirebaseConfig();
  if (!cfg) throw new Error("Firebase is not configured");

  const app = getOrInitApp(cfg);
  const bucket = admin.storage(app).bucket();

  const objectId = randomUUID();
  const objectName = `uploads/${objectId}`;
  const file = bucket.file(objectName);

  const [uploadURL] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  return { uploadURL, objectPath: `/objects/${objectId}` };
}

export async function streamFirebaseObject(objectPath: string): Promise<{
  status: number;
  headers: Record<string, string>;
  stream: NodeJS.ReadableStream;
} | null> {
  const cfg = await loadFirebaseConfig();
  if (!cfg) return null;

  const app = getOrInitApp(cfg);
  const bucket = admin.storage(app).bucket();

  const id = objectPath.replace(/^\/objects\//, "");
  const file = bucket.file(`uploads/${id}`);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [metadata] = await file.getMetadata();
  const headers: Record<string, string> = {
    "Content-Type": (metadata.contentType as string) || "application/octet-stream",
    "Cache-Control": "public, max-age=3600",
  };
  if (metadata.size) headers["Content-Length"] = String(metadata.size);

  return { status: 200, headers, stream: file.createReadStream() };
}

export async function testFirebaseConnection(cfg: FirebaseConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const tempApp = admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId: cfg.projectId,
          clientEmail: cfg.clientEmail,
          privateKey: cfg.privateKey.replace(/\\n/g, "\n"),
        }),
        storageBucket: cfg.bucket,
      },
      `firebase-test-${Date.now()}`
    );
    try {
      const bucket = admin.storage(tempApp).bucket();
      const [exists] = await bucket.exists();
      if (!exists) return { ok: false, error: "Bucket غير موجود" };
      return { ok: true };
    } finally {
      await tempApp.delete().catch(() => {});
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "فشل الاتصال" };
  }
}
