"use client";

import { usePathname } from "next/navigation";
import { routeSkeletonKind } from "@/lib/navigation/loading-shape";
import { ActivitySignal } from "./activity-link";
import ContentSkeleton from "./content-skeleton";

export default function RouteSkeleton({fallbackPath}: {fallbackPath: string}) {
  return <><ActivitySignal /><ContentSkeleton kind={routeSkeletonKind(usePathname() || fallbackPath)} /></>;
}
