import { notFound } from "next/navigation";

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  void slug;

  notFound();
}
