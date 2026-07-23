import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DetailHeader from "@/components/tool/DetailHeader";
import SpecSheet from "@/components/tool/SpecSheet";
import ExampleGames from "@/components/tool/ExampleGames";
import Relationships from "@/components/tool/Relationships";
import { getAllToolSlugs, getToolBySlug } from "@/lib/graphql/tool";

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) return {};

  return {
    title: `${tool.name} · GDTRKB`,
    description: tool.summary,
  };
}

// Detail page (app-spec §6/§8): SSG + ISR, all schema sections for one tool.
// A network/API failure propagates to app/error.tsx (getToolBySlug throws);
// a genuinely unknown slug renders the 404 page instead.
export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) notFound();

  return (
    <div>
      <DetailHeader tool={tool} />

      <p className="mt-4 mb-6 max-w-[70ch] text-[19px] text-ink">{tool.summary}</p>

      <SpecSheet tool={tool} />

      <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
        <ExampleGames games={tool.exampleGames} />
        <Relationships tool={tool} />
      </div>
    </div>
  );
}
