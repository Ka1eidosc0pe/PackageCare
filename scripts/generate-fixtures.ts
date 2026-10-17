import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile),
  root = path.resolve(process.env.DATA_DIR || "data");
// Original vector artwork, deliberately synthetic. No real person, brand, or camera footage.
function scene(t: number, scenario: string) {
  const approach = Math.max(0, Math.min(1, (t - 0.5) / 2));
  const personX = 170 + approach * 480 + (t > 5 ? (t - 5) * -110 : 0);
  let x = personX + 52,
    y = 385,
    rotation = 0;
  if (scenario === "drop") {
    if (t >= 3 && t < 4.1) {
      const p = (t - 3) / 1.1;
      x = 702 + p * 235;
      y = 385 - 150 * Math.sin(p * Math.PI) + p * 160;
      rotation = p * 55;
    } else if (t >= 4.1) {
      x = 937;
      y = 545;
      rotation = 0;
    }
  } else {
    if (t >= 3 && t < 4.8) {
      const p = (t - 3) / 1.8;
      x = 702 + p * 200;
      y = 385 + p * 160;
    } else if (t >= 4.8) {
      x = 902;
      y = 545;
    }
  }
  const arm = t < 3 ? 0 : Math.min(1, (t - 3) / 0.7) * -25;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#b6c3b1"/><stop offset="1" stop-color="#9aab96"/></linearGradient><linearGradient id="ground" x2="0" y2="1"><stop stop-color="#b8bba8"/><stop offset="1" stop-color="#919b80"/></linearGradient><filter id="shade"><feGaussianBlur stdDeviation="9"/></filter><pattern id="siding" width="1280" height="47" patternUnits="userSpaceOnUse"><path d="M0 46H1280" stroke="#7f967b" opacity=".3"/><path d="M0 47H1280" stroke="#d6dfcc" opacity=".4"/></pattern></defs><rect width="1280" height="720" fill="#cad1bc"/><rect width="1280" height="506" fill="url(#wall)"/><rect width="1280" height="506" fill="url(#siding)"/><rect x="718" y="56" width="360" height="458" fill="#71866b"/><rect x="730" y="65" width="335" height="444" fill="#e1dfcc"/><rect x="748" y="84" width="299" height="425" fill="#385b4f"/><rect x="773" y="110" width="248" height="188" rx="4" fill="#294b40"/><path d="M796 125H1001V277H796Z" fill="#55766a"/><path d="M892 125V277M796 202H1001" stroke="#345a4d" stroke-width="8"/><rect x="774" y="331" width="247" height="145" rx="3" fill="#2f5145"/><circle cx="1003" cy="326" r="7" fill="#c7bb8c"/><rect x="670" y="219" width="22" height="65" rx="8" fill="#e1e1ce"/><circle cx="681" cy="235" r="5" fill="#4b6155"/><rect x="187" y="111" width="273" height="243" fill="#e0dfc9"/><rect x="201" y="126" width="245" height="214" fill="#69897d"/><path d="M323 126V340M201 234H446" stroke="#d6d6bd" stroke-width="10"/><path d="M205 134L441 134 205 327Z" fill="#a4b7a5" opacity=".2"/><rect y="506" width="1280" height="214" fill="url(#ground)"/><path d="M520 720 667 506H1100L1260 720Z" fill="#c0c1ab"/><path d="M578 640H1207M617 576H1160M740 506 696 720M955 506 1035 720" stroke="#a9ac96" stroke-width="2"/><path d="M692 506H1103V535H679Z" fill="#a8ac96"/><rect x="762" y="518" width="294" height="65" rx="3" fill="#74836c"/><path d="M781 533H1037M781 544H1037M781 555H1037M781 566H1037" stroke="#8c997f" stroke-width="3" opacity=".6"/><ellipse cx="1153" cy="536" rx="72" ry="15" fill="#63795b" opacity=".3" filter="url(#shade)"/><path d="M1107 456H1196L1183 535H1120Z" fill="#b68e70"/><ellipse cx="1151" cy="453" rx="48" ry="12" fill="#8f7057"/><g fill="#526f50"><ellipse cx="1151" cy="400" rx="34" ry="62"/><ellipse cx="1119" cy="423" rx="29" ry="35"/><ellipse cx="1182" cy="420" rx="28" ry="44"/></g><path d="M1150 458V367M1150 423 1123 404M1150 408 1173 388" stroke="#6c7f53" stroke-width="5"/><path d="M0 648Q185 565 368 720H0Z" fill="#7e956d"/><path d="M0 683Q185 625 270 720H0Z" fill="#68865f"/><g opacity=".5" fill="#a6b18c"><circle cx="75" cy="646" r="25"/><circle cx="143" cy="672" r="23"/><circle cx="25" cy="696" r="34"/></g><ellipse cx="${personX}" cy="574" rx="58" ry="10" fill="#4b5a47" opacity=".22" filter="url(#shade)"/><g transform="translate(${personX},0)"><path d="M-22 414-27 548-42 561H-10L6 433 19 548 12 562H46L33 414Z" fill="#46534d"/><path d="M-31 304Q-3 286 29 304L39 421H-31Z" fill="#916f61"/><path d="M-25 316-48 377-18 400" fill="none" stroke="#b69c83" stroke-width="18" stroke-linecap="round"/><path d="M27 318 52 ${366 + arm} 74 ${381 + arm}" fill="none" stroke="#b69c83" stroke-width="17" stroke-linecap="round"/><rect x="-10" y="277" width="22" height="27" rx="7" fill="#b69c83"/><ellipse cx="0" cy="255" rx="27" ry="34" fill="#b69c83"/><path d="M-26 252Q-33 215 4 218Q32 219 28 249L10 236Z" fill="#4c5c50"/></g><g transform="translate(${x},${y}) rotate(${rotation})"><ellipse cx="0" cy="25" rx="55" ry="8" fill="#67735b" opacity=".15"/><path d="M-39-26 26-35 44-13 44 27-21 36-39 16Z" fill="#b7986e"/><path d="M-39-26-21-4 44-13M-21-4V36M-9-31 11-9 11 31" fill="none" stroke="#d2bb8f" stroke-width="5"/><path d="M-39-26 26-35 44-13-21-4Z" fill="#cbb18a"/><path d="M-21-4 44-13V27L-21 36Z" fill="#bda079"/></g>${scenario === "ambiguous" && t > 2.7 && t < 5.6 ? '<path d="M620 280H1010V620H620Z" fill="#788d6c"/><path d="M620 280H1010V304H620Z" fill="#8d9d7d"/>' : ""}<rect x="0" y="0" width="1280" height="42" fill="#283f34" opacity=".8"/><text x="23" y="27" font-family="sans-serif" font-size="14" fill="#e1e8d7" letter-spacing="2">PACKAGECARE · SYNTHETIC TEST SCENE</text><text x="1255" y="27" text-anchor="end" font-family="monospace" font-size="14" fill="#e1e8d7">${t.toFixed(2)}s</text></svg>`;
}
await fs.mkdir(path.join(root, "fixtures"), { recursive: true });
for (const scenario of ["normal", "drop", "ambiguous"]) {
  const dir = path.join(root, "tmp", `frames-${scenario}`);
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < 120; i++)
    await sharp(Buffer.from(scene(i / 15, scenario)))
      .png()
      .toFile(path.join(dir, `${String(i).padStart(4, "0")}.png`));
  await exec(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-framerate",
      "15",
      "-i",
      path.join(dir, "%04d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "23",
      "-movflags",
      "+faststart",
      path.join(root, "fixtures", `${scenario}.mp4`),
    ],
    { timeout: 60000 },
  );
  await fs.rm(dir, { recursive: true, force: true });
  console.log(`Generated ${scenario}: synthetic 8-second animation`);
}
