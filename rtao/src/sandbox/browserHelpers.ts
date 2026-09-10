export function ensureHost(
  size: { width: number; height: number },
  id = "rta-sandbox-capture-host",
): HTMLDivElement {
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  host.style.width = `${size.width}px`;
  host.style.height = `${size.height}px`;
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.append(host);
  return host;
}

export function cloneBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const clone = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  clone.set(bytes);
  return clone;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "unavailable-in-browser-context";
  const digest = await subtle.digest("SHA-256", cloneBytes(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function blobDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not encode capture PNG."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Capture PNG did not encode as a data URL."));
    reader.readAsDataURL(blob);
  });
}
