import { redirect } from "next/navigation";

import { requireAreaPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import { getCanonicalAreaPath } from "@/src/domain/area-access";

export const dynamic = "force-dynamic";

export async function loadCatalogPage(
  dependencies: AreaPageDependencies = {},
) {
  const { session } = await requireAreaPageAccess(dependencies);

  redirect(getCanonicalAreaPath(session.areaId));
}

export default async function CatalogPage() {
  await loadCatalogPage();

  return null;
}
