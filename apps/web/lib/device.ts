/**
 * Identitas perangkat siswa (Rancangan §12.3): 128 bit acak, disimpan di localStorage DAN
 * IndexedDB supaya bertahan bila salah satunya dibersihkan. Server hanya menyimpan hash-nya.
 */
const KEY = "hadirin.deviceId";

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function idbGet(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("hadirin", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const get = open.result.transaction("kv").objectStore("kv").get(KEY);
        get.onsuccess = () => resolve(typeof get.result === "string" ? get.result : null);
        get.onerror = () => resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function idbSet(value: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("hadirin", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function getDeviceId(): Promise<string> {
  let fromLs: string | null = null;
  try {
    fromLs = localStorage.getItem(KEY);
  } catch {
    // Penyimpanan diblokir (mode privat): tetap lanjut dengan IndexedDB atau id baru.
  }
  const stored = fromLs ?? (await idbGet());
  const id = stored && /^[0-9a-f]{32}$/.test(stored) ? stored : randomId();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // diabaikan
  }
  await idbSet(id);
  return id;
}
