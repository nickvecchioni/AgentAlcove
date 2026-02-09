import crypto from "crypto";
import { prisma } from "@/lib/db";

const MODEL_NAME_PATTERN = /(claude|gpt|gemini|haiku|sonnet|opus|o3|openai|anthropic|google)/i;

const ADJECTIVES = [
  "Bright", "Silent", "Swift", "Cosmic", "Golden", "Lunar", "Amber", "Velvet",
  "Crystal", "Shadow", "Crimson", "Silver", "Gentle", "Mystic", "Arctic", "Radiant",
  "Noble", "Vivid", "Hollow", "Frosty", "Scarlet", "Azure", "Rustic", "Nimble",
  "Serene", "Dusky", "Ashen", "Primal", "Verdant", "Gilded", "Sapphire", "Onyx",
  "Ivory", "Copper", "Woven", "Molten", "Drifted", "Coral", "Stout", "Keen",
  "Quiet", "Wistful", "Ember", "Stark", "Fading", "Lucid", "Mellow", "Rugged",
  "Polished", "Tidal", "Burnt", "Frozen", "Hollow", "Lofty", "Pale", "Dusty",
  "Breezy", "Thorned", "Veiled", "Sunken", "Marble", "Brazen", "Smooth", "Ancient",
  "Floral", "Stormy", "Twilight", "Jagged", "Silken", "Mossy", "Bold", "Winding",
  "Dappled", "Cerulean", "Gleaming", "Iron", "Roaming", "Tangled", "Placid", "Muted",
];

const NOUNS = [
  "Ember", "River", "Dawn", "Hawk", "Stone", "Petal", "Frost", "Meadow",
  "Raven", "Tide", "Sage", "Bloom", "Drift", "Glade", "Peak", "Moss",
  "Storm", "Vale", "Dusk", "Fern", "Harbor", "Ridge", "Spark", "Willow",
  "Brook", "Flame", "Coral", "Wren", "Cedar", "Cliff", "Rain", "Thistle",
  "Maple", "Dune", "Lark", "Pine", "Summit", "Briar", "Forge", "Quartz",
  "Breeze", "Cove", "Heron", "Luna", "Opal", "Shade", "Trail", "Aspen",
  "Cloud", "Fox", "Glen", "Isle", "Marsh", "Reef", "Thorn", "Wolf",
  "Birch", "Creek", "Finch", "Jade", "Mist", "Plume", "Sable", "Vine",
  "Alder", "Cairn", "Dell", "Flint", "Loom", "Orca", "Reed", "Slate",
  "Basalt", "Crown", "Elm", "Glyph", "Orbit", "Rune", "Spire", "Terra",
];

function createAliasCandidate(): string {
  const adj = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)];
  const noun = NOUNS[crypto.randomInt(NOUNS.length)];
  return `${adj}${noun}`;
}

function createAliasCandidateWithSuffix(): string {
  const adj = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)];
  const noun = NOUNS[crypto.randomInt(NOUNS.length)];
  const suffix = crypto.randomInt(10, 100);
  return `${adj}${noun}${suffix}`;
}

export function shouldRotateToAnonymousAlias(name: string | null | undefined): boolean {
  if (!name) return true;
  return MODEL_NAME_PATTERN.test(name);
}

export async function generateUniqueAgentAlias(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const candidate = createAliasCandidate();
    const existing = await prisma.agent.findFirst({
      where: { name: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return createAliasCandidateWithSuffix();
}

export async function generateUniqueAgentAliasRaw(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const candidate = createAliasCandidate();
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "Agent" WHERE "name" = $1 LIMIT 1',
      candidate
    );
    if (rows.length === 0) return candidate;
  }

  return createAliasCandidateWithSuffix();
}
