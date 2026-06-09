// Server-only helpers for Google Drive via Lovable connector gateway.
// NEVER import from client code.

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const UPLOAD_GATEWAY = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Google Drive não está conectado (LOVABLE_API_KEY ou GOOGLE_DRIVE_API_KEY ausente)");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

async function driveFetch(path: string, init: RequestInit = {}, base = GATEWAY): Promise<Response> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 || res.status === 403) {
     console.error("Google Drive Auth Error:", res.status, await res.clone().text());
  }
  return res;
}

export async function ensureOrgFolder(orgId: string, orgName: string): Promise<string> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='lovableOrgId' and value='${orgId}' }`
  );
  const searchRes = await driveFetch(`/files?q=${q}&fields=files(id,name)&spaces=drive`);
  if (searchRes.ok) {
    const json = (await searchRes.json()) as { files?: Array<{ id: string }> };
    if (json.files && json.files.length > 0) return json.files[0].id;
  }
  const createRes = await driveFetch("/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Lovable - ${orgName} (${orgId.slice(0, 8)})`,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { lovableOrgId: orgId },
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Falha ao criar pasta no Drive: ${createRes.status} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export interface DriveUploadResult {
  id: string;
  webViewLink?: string;
}

export async function uploadFileToDrive(params: {
  folderId: string;
  filename: string;
  mimeType: string;
  body: ArrayBuffer | Uint8Array;
  appProperties?: Record<string, string>;
}): Promise<DriveUploadResult> {
  const boundary = `----lovable_${crypto.randomUUID()}`;
  const metadata = {
    name: params.filename,
    parents: [params.folderId],
    mimeType: params.mimeType,
    appProperties: params.appProperties ?? {},
  };
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const fileBytes = params.body instanceof Uint8Array ? params.body : new Uint8Array(params.body);
  const body = new Uint8Array(head.length + fileBytes.length + tail.length);
  body.set(head, 0);
  body.set(fileBytes, head.length);
  body.set(tail, head.length + fileBytes.length);

  const res = await driveFetch(
    `/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    UPLOAD_GATEWAY
  );
  if (!res.ok) {
    throw new Error(`Falha no upload para o Drive: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as DriveUploadResult;
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const res = await driveFetch(`/files/${fileId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Falha ao deletar do Drive: ${res.status} ${await res.text()}`);
  }
}

export async function streamDriveFile(fileId: string): Promise<Response> {
  return driveFetch(`/files/${fileId}?alt=media`);
}
