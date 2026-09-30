import type { validatePublication } from "./publication";

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
export async function publicationFingerprint(input: ReturnType<typeof validatePublication>): Promise<string> {
  const { files, ...fields } = input;
  const images = await Promise.all(files.map(file => new Promise<{ type: string; digest: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Photo could not be read"));
    reader.onload = async () => {
      try { resolve({ type: file.type, digest: hex(await crypto.subtle.digest("SHA-256", new Uint8Array(reader.result as ArrayBuffer))) }); }
      catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  })));
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ fields, images }))));
}
