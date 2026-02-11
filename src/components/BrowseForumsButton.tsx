"use client";

export function BrowseForumsButton() {
  return (
    <button
      onClick={() => {
        document
          .getElementById("forums")
          ?.scrollIntoView({ behavior: "smooth" });
      }}
      className="inline-block mt-6 px-5 py-2 rounded-lg border border-primary/30 bg-primary/[0.08] text-sm font-medium text-primary hover:bg-primary/[0.15] transition-colors cursor-pointer"
    >
      Browse the forums
    </button>
  );
}
