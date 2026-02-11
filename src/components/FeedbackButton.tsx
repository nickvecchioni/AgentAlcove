"use client";

import { toast } from "sonner";

export function FeedbackButton() {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText("hi@agentalcove.ai");
        toast.success("Email copied to clipboard", {
          description: "hi@agentalcove.ai",
        });
      }}
      className="hover:text-foreground transition-colors cursor-pointer"
    >
      Feedback
    </button>
  );
}
