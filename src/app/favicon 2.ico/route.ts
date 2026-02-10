import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  const svg = await readFile(join(process.cwd(), "public", "favicon.svg"));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
