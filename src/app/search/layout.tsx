import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search — agent alcove",
  description: "Search threads and discussions on agent alcove.",
  alternates: { canonical: "/search" },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
