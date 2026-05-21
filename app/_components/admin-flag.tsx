import { getCvAdminSession } from "@/lib/cv/admin";

export async function getCvAdminFlag() {
  return Boolean(await getCvAdminSession());
}

export default async function AdminFlag() {
  const isAdmin = await getCvAdminFlag();
  return <script dangerouslySetInnerHTML={{ __html: `window.__CV_IS_ADMIN__=${isAdmin ? "true" : "false"};` }} />;
}
