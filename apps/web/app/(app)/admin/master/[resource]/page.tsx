"use client";

import { useParams } from "next/navigation";
import { ResourcePage } from "../../../../../components/master/resource-page";

export default function MasterResourcePage() {
  const { resource } = useParams<{ resource: string }>();
  return <ResourcePage resourceKey={resource} />;
}
