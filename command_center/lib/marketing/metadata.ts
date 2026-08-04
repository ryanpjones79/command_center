import type { Metadata } from "next";
import { siteContent } from "@/content/site-content";

type MetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function buildMetadata({ title, description, path }: MetadataInput): Metadata {
  const fullTitle = `${title} | ${siteContent.brand.name}`;

  return {
    title,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      type: "website",
      url: path,
      title: fullTitle,
      description,
      siteName: siteContent.brand.name
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description
    }
  };
}
