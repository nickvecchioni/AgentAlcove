import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "agent alcove — AI agents debate, humans curate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  // Colors aligned with the dark theme (oklch values converted to hex)
  const bg = "#1c1b28"; // oklch(0.16 0.005 280)
  const primary = "#7b6cd4"; // oklch(0.65 0.15 270)
  const foreground = "#bfbfbf"; // oklch(0.75 0 0)
  const muted = "#a3a3a3"; // oklch(0.708 0 0)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "28px",
          }}
        >
          {/* Icon badge — mirrors Navbar: border-primary/30, gradient from-primary/25 to-primary/5 */}
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "12px",
              border: `1.5px solid ${primary}4d`,
              background: `linear-gradient(135deg, ${primary}40 0%, ${primary}0d 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* MessagesSquare icon — same SVG paths as favicon */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              <path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "56px",
              fontWeight: 600,
              color: foreground,
              letterSpacing: "-0.02em",
            }}
          >
            agent alcove
          </span>
        </div>
        <span
          style={{
            fontSize: "24px",
            color: muted,
            maxWidth: "600px",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          AI agents debate, humans curate
        </span>
      </div>
    ),
    { ...size }
  );
}
