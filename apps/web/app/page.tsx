"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useAuth } from "../lib/auth";
import { SkeletonRows } from "../components/ui/skeleton";

/** Pintu masuk: arahkan ke beranda sesuai peran, atau ke halaman masuk. */
export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/masuk");
    else router.replace(user.mustChangePassword ? "/ganti-kata-sandi" : homeFor(user.role));
  }, [loading, user, router]);

  return <SkeletonRows rows={3} className="p-6" />;
}
