import sharp, { type OverlayOptions } from "sharp";
import type { FrameReference } from "./handling-evidence.js";

export const SHEET_VERSION = "six-panels-native-size-jpeg95-v1";
export interface HandlingSheet {
  bytes: Buffer;
  width: number;
  height: number;
  panels: {
    id: string;
    alias: string;
    offsetMs: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

// Mistral's actual Bedrock endpoint accepts three image blocks. Preserve all
// sixteen full frames with deterministic 6/6/4 panel packing, without selecting
// action times, cropping, resizing, or drawing over source pixels.
export async function packHandlingFrames(
  references: FrameReference[],
  bytes: Map<string, Buffer>,
): Promise<HandlingSheet[]> {
  if (references.length !== 16)
    throw new Error("Sheet packing requires all sixteen frames");
  const sheets: HandlingSheet[] = [];
  for (let start = 0; start < references.length; start += 6) {
    const group = references.slice(start, start + 6);
    const sizes = await Promise.all(
      group.map(async (r) => {
        if (!/^f\d+$/.test(r.alias) || !Number.isInteger(r.asset.offsetMs))
          throw new Error("Invalid panel identity");
        const b = bytes.get(r.asset.id);
        if (!b) throw new Error("Missing frame bytes");
        const m = await sharp(b).metadata();
        if (!m.width || !m.height) throw new Error("Missing frame dimensions");
        return { width: m.width, height: m.height };
      }),
    );
    const cellWidth = Math.max(...sizes.map((m) => m.width), 200);
    const cellHeight = Math.max(...sizes.map((m) => m.height)) + 32;
    const width = cellWidth * 2,
      height = cellHeight * Math.ceil(group.length / 2);
    if (width > 8000 || height > 8000)
      throw new Error("Image sheet exceeds API dimensions");
    const panels = group.map((r, i) => ({
      id: r.asset.id,
      alias: r.alias,
      offsetMs: r.asset.offsetMs!,
      x: (i % 2) * cellWidth,
      y: Math.floor(i / 2) * cellHeight + 32,
      ...sizes[i],
    }));
    const overlays: OverlayOptions[] = panels.flatMap((p) => [
      { input: bytes.get(p.id)!, left: p.x, top: p.y },
      {
        input: Buffer.from(
          `<svg width="${cellWidth}" height="32"><rect width="100%" height="100%" fill="#111820"/><text x="8" y="23" font-size="20" font-family="sans-serif" fill="white">${p.alias} : ${p.offsetMs} ms</text></svg>`,
        ),
        left: p.x,
        top: p.y - 32,
      },
    ]);
    const data = await sharp({
      create: { width, height, channels: 3, background: "#111820" },
    })
      .composite(overlays)
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (data.length > 3.75 * 1024 * 1024)
      throw new Error("Image sheet exceeds API byte limit");
    sheets.push({ bytes: data, width, height, panels });
  }
  return sheets;
}
