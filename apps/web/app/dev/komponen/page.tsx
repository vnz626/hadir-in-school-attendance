import { notFound } from "next/navigation";
import { Catalog } from "./catalog";

// Katalog internal (Rancangan §4.9): hanya aktif di lokal. Di produksi harus dimatikan.
export default function KomponenPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_CATALOG !== "true")
    notFound();
  return <Catalog />;
}
