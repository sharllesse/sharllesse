/**
 * Builds the README frames from the portfolio itself.
 *
 * Content comes from the portfolio's src/data/portfolio.ts, so the profile README and
 * sharllesse.github.io can never drift apart: edit a project there, run `npm run build`
 * here. Satori lays the frames out with flexbox and turns every glyph into a path, which
 * is what lets GitHub show Archivo and Martian Mono - an <img>'d SVG cannot load fonts.
 *
 * The look is the portfolio's "Camera Negative" (DESIGN.md): a void ground, one warm
 * practical, frame lines and slates, real grain.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import satori from "satori";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const OUT = join(REPO, "assets");
const PORTFOLIO = resolve(process.env.PORTFOLIO_DIR ?? join(REPO, "..", "..", "HTML", "sharllesse.github.io"));
const RES = join(PORTFOLIO, "public", "resources");

// versioned() in the portfolio hashes files relative to the cwd.
process.chdir(PORTFOLIO);
const P = await import(pathToFileURL(join(PORTFOLIO, "src", "data", "portfolio.ts")).href);

// ---- Tokens (DESIGN.md) --------------------------------------------------------------
const C = {
  base: "#060a0d", field: "#16171a", field2: "#1e2023",
  edge: "rgba(219,227,232,0.19)", edgeSoft: "rgba(219,227,232,0.09)",
  ink: "#dfe7ec", ink2: "#a3b2bd", ink3: "#7d8d99",
  chroma: "#e8a55c", chromaOn: "#060a0d", halo: "rgba(255,194,122,0.42)",
};

const font = (f: string) => readFileSync(join(HERE, "..", "fonts", f));
const FONTS = [
  { name: "Archivo", data: font("archivo-400.ttf"), weight: 400 as const },
  { name: "Archivo", data: font("archivo-600.ttf"), weight: 600 as const },
  { name: "Archivo Expanded", data: font("archivo-expanded-500.ttf"), weight: 500 as const },
  { name: "Archivo Expanded", data: font("archivo-expanded-600.ttf"), weight: 600 as const },
  { name: "Martian Mono", data: font("martian-400.ttf"), weight: 400 as const },
  { name: "Martian Mono", data: font("martian-600.ttf"), weight: 600 as const },
];
const SANS = "Archivo", WIDE = "Archivo Expanded", MONO = "Martian Mono";

// ---- A tiny element factory (Satori takes React-shaped objects, no React needed) -----
type Node = { type: string; props: Record<string, unknown> } | string | null;
function h(type: string, style: Record<string, unknown>, ...children: Node[]): Node {
  const kids = children.flat().filter((c) => c !== null && c !== false);
  return { type, props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
const img = (src: string, width: number, height: number) =>
  ({ type: "img", props: { src, width, height, style: { width, height } } });

// ---- Text helpers --------------------------------------------------------------------
const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Authored HTML with <strong> runs -> a wrapping row of words, bold words lifted to ink. */
function rich(html: string, size: number, color = C.ink2, lineHeight = 1.55): Node {
  const parts = html.replace(/\s+/g, " ").trim().split(/(<strong>.*?<\/strong>)/g).filter(Boolean);
  const words: { bold: boolean; text: string }[][] = [[]];
  for (const part of parts) {
    const bold = part.startsWith("<strong>");
    const text = decode(part.replace(/<\/?strong>/g, ""));
    text.split(/( )/).forEach((tok) => {
      if (tok === " ") words.push([]);
      else if (tok) words[words.length - 1].push({ bold, text: tok });
    });
  }
  return h("div", { flexWrap: "wrap", columnGap: size * 0.27, fontFamily: SANS, fontSize: size, lineHeight, color },
    ...words.filter((w) => w.length).map((w) =>
      h("span", {}, ...w.map((p) => h("span", p.bold ? { color: C.ink, fontWeight: 600 } : {}, p.text)))));
}

const monoText = (text: string, size: number, color = C.ink3, extra: Record<string, unknown> = {}) =>
  h("span", { fontFamily: MONO, fontSize: size, color, letterSpacing: size * 0.16, textTransform: "uppercase", ...extra }, text);

const chip = (label: string, size = 15) =>
  h("span", { background: C.chroma, color: C.chromaOn, fontFamily: MONO, fontWeight: 600, fontSize: size,
    letterSpacing: size * 0.14, padding: `${size * 0.2}px ${size * 0.55}px` }, label);

/** Portfolio code gates are highlighted HTML (<span class="k">...). Same ramp here. */
const SYN: Record<string, Record<string, unknown>> = {
  k: { color: C.chroma }, t: { color: C.ink }, m: { color: C.chroma, fontWeight: 600 },
  s: { color: C.ink2 }, p: { color: C.ink3 }, "": { color: C.ink2 },
};
function code(html: string, size: number): Node {
  return h("div", { flexDirection: "column", fontFamily: MONO, fontSize: size, lineHeight: 1.62 },
    ...html.split("\n").map((line) => {
      const toks = [...line.matchAll(/<span class="(\w)">(.*?)<\/span>|([^<]+)/g)]
        // Non-breaking spaces: Satori trims plain spaces at span edges, which glued tokens together.
        .map((m) => ({ cls: m[1] ?? "", text: decode(m[2] ?? m[3]).replace(/ /g, " ") }));
      return h("div", { whiteSpace: "pre", minHeight: size * 1.62 },
        ...toks.map((t) => h("span", { whiteSpace: "pre", ...SYN[t.cls] }, t.text)));
    }));
}

// ---- Photographs, graded by the page's tokens (--plate-grade + toe lift) --------------
async function graded(file: string, w: number, h_: number, focusY: number) {
  const meta = await sharp(join(RES, file)).metadata();
  // object-fit: cover, with the portfolio's object-position (50% focusY).
  const scale = Math.max(w / meta.width!, h_ / meta.height!);
  const sw = Math.ceil(meta.width! * scale), sh = Math.ceil(meta.height! * scale);
  const left = Math.round((sw - w) / 2), top = Math.round((sh - h_) * focusY);
  const lift = await sharp({ create: { width: w, height: h_, channels: 3, background: "#121316" } }).png().toBuffer();
  const buf = await sharp(join(RES, file))
    .resize({ width: sw, height: sh })
    .extract({ left, top, width: w, height: h_ })
    .modulate({ saturation: 0.46, hue: -8 })
    .linear(1.06, -0.03 * 255)
    .composite([{ input: lift, blend: "lighten" }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// ---- Output: Satori, then grain and motion it cannot express --------------------------
/** Grain is a small pre-rendered noise tile, not an feTurbulence filter: a filter is
 *  re-rasterised on every frame it moves, and a profile page shows a dozen of these. */
const TILE = 64;
const noiseTile = await (async () => {
  const px = Buffer.alloc(TILE * TILE);
  // Seeded, so a rebuild only changes the frames whose content changed.
  let seed = 0x2545f491;
  for (let i = 0; i < px.length; i++) px[i] = (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
  const png = await sharp(px, { raw: { width: TILE, height: TILE, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
})();
const GRAIN_DEFS = `<defs><pattern id="grain" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse">`
  + `<image href="${noiseTile}" width="${TILE}" height="${TILE}"/></pattern></defs>`;
/** Only the header moves: the grain boils like the portfolio's. */
const MOTION = `<style>
.boil{animation:boil .9s steps(1) infinite}
@keyframes boil{0%{transform:translate(0,0)}25%{transform:translate(-57px,31px)}50%{transform:translate(43px,-71px)}75%{transform:translate(-23px,-17px)}}
@media (prefers-reduced-motion:reduce){.boil{animation:none}}
</style>`;

async function render(name: string, node: Node, width: number, height: number,
                      { grain = 0.05, animate = false } = {}) {
  let svg = await satori(node as never, { width, height, fonts: FONTS });
  const pad = TILE;
  const noise = `<g opacity="${grain}" style="mix-blend-mode:overlay"><rect${animate ? ' class="boil"' : ""} `
    + `x="-${pad}" y="-${pad}" width="${width + 2 * pad}" height="${height + 2 * pad}" fill="url(#grain)"/></g>`;
  svg = svg
    // Glyph outlines only: a tenth of a unit is invisible at 2x and keeps the files light.
    .replace(/ d="([^"]*)"/g, (_, d) => ` d="${d.replace(/(\d+\.\d)\d+/g, "$1")}"`)
    .replace(/(<svg[^>]*>)/, `$1${animate ? MOTION : ""}${GRAIN_DEFS}`)
    .replace(/<\/svg>$/, `${noise}</svg>`);
  writeFileSync(join(OUT, name), svg);
  console.log(`assets/${name}`.padEnd(34), `${(svg.length / 1024).toFixed(0)} KB`);
}

const frame = (w: number, h_: number, ...children: Node[]) =>
  h("div", { width: w, height: h_, background: C.base, padding: 20 },
    h("div", { flex: 1, border: `1px solid ${C.edge}`, background: C.field, flexDirection: "column" }, ...children));

// ---- 001 · Profile ------------------------------------------------------------------
/** The portfolio's bio opens under the name ("A C++ developer..."). Here there is no name
 *  above it, so it introduces itself. Derived, not copied, so the rest stays in sync. */
function introBio(): string {
  const bio = (P.bio.en as string).replace(/\s+/g, " ").trim();
  if (!/^A /.test(bio)) throw new Error(`portfolio bio no longer starts with "A ": update introBio()`);
  return bio.replace(/^A /, `I'm ${(P.site.name as string).split(" ")[0]}, a `);
}

async function header() {
  const W = 1200, H = 322;
  await render("header.svg",
    h("div", { width: W, height: H, background: C.base, padding: 20 },
      h("div", { flex: 1, flexDirection: "column", border: `1px solid ${C.edge}`, padding: "50px 44px 0" },
        h("div", { alignItems: "center" },
          h("span", { fontFamily: WIDE, fontWeight: 600, fontSize: 46, letterSpacing: 3, color: C.ink,
            textShadow: `0 0 12px ${C.halo}` }, "HELLO THERE")),
        h("div", { width: 1060, marginTop: 24 }, rich(introBio(), 21)),
        h("div", { marginTop: "auto", marginBottom: 22, paddingTop: 14, borderTop: `1px solid ${C.edgeSoft}`,
          alignItems: "center", gap: 20 },
          chip("001"), monoText(P.frameSlates.identity.role.en, 14, C.ink2), monoText(P.site.location, 14)))),
    W, H, { grain: 0.09, animate: true });
}

// ---- Section slates -------------------------------------------------------------------
async function section(name: string, no: string, title: string) {
  const W = 1200, H = 96;
  await render(name,
    h("div", { width: W, height: H, background: C.base, padding: "0 28px", alignItems: "flex-end" },
      h("div", { flex: 1, alignItems: "center", gap: 22, paddingBottom: 16, borderBottom: `1px solid ${C.edge}` },
        chip(no, 16),
        h("span", { fontFamily: WIDE, fontWeight: 500, fontSize: 30, letterSpacing: 3.6, color: C.ink }, title.toUpperCase()))),
    W, H, { grain: 0.04 });
}

// ---- Links ---------------------------------------------------------------------------
async function link(name: string, label: string, primary = false) {
  const W = 300, H = 76;
  await render(name,
    h("div", { width: W, height: H, background: primary ? C.chroma : C.field, border: `2px solid ${primary ? C.chroma : C.edge}`,
      alignItems: "center", justifyContent: "center", gap: 14 },
      monoText(label, 19, primary ? C.chromaOn : C.ink, { fontWeight: 600, letterSpacing: 3 })),
    W, H, { grain: 0.04 });
}

// ---- 002 · Selected work -------------------------------------------------------------
const CARD_W = 800, CARD_H = 780, GATE_H = 300;

async function card(p: any, i: number) {
  const gate = p.gate.kind === "code"
    ? h("div", { height: GATE_H, background: C.field2, flexDirection: "column", justifyContent: "center", padding: "0 38px" },
        h("span", { fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: C.ink3, marginBottom: 20 }, p.gate.file),
        code(p.gate.html, 19))
    : img(await graded(p.gate.fallback.replace("/resources/", ""), 796, GATE_H, 0.34), 796, GATE_H);

  await render(`work-${i + 1}.svg`,
    h("div", { width: CARD_W, height: CARD_H, background: C.field, border: `2px solid ${C.edge}`, flexDirection: "column" },
      h("div", { flexDirection: "column", borderBottom: `2px solid ${C.edge}` }, gate),
      h("div", { flex: 1, flexDirection: "column", padding: "36px 38px 30px" },
        h("span", { fontFamily: WIDE, fontWeight: 600, fontSize: 30, letterSpacing: 2.2, color: C.ink,
          textShadow: `0 0 12px ${C.halo}` }, p.title.toUpperCase()),
        h("div", { marginTop: 18 }, rich(p.description.en, 19.5)),
        h("div", { marginTop: "auto", flexWrap: "wrap", gap: 10 },
          ...p.tags.map((t: string) => h("span", { border: `1.5px solid ${C.edge}`, padding: "7px 13px",
            fontFamily: MONO, fontSize: 14, letterSpacing: 1, color: C.ink2 }, t))),
        h("div", { marginTop: 24, paddingTop: 18, borderTop: `1.5px solid ${C.edgeSoft}`, alignItems: "center", gap: 16 },
          chip(`002.${i + 1}`, 14), monoText(p.date.en, 14, C.ink2), monoText(p.slate.role.en, 14),
          h("div", { marginLeft: "auto" }, monoText(p.cta.en, 14, C.chroma, { fontWeight: 600 }))))),
    CARD_W, CARD_H, { grain: 0.06 });
}

// ---- 003 · Stack ---------------------------------------------------------------------
async function stack() {
  const rows: [string, string[]][] = [
    ["Languages", ["C++", "C#", "CMake", ".NET"]],
    ["Engines", ["Unreal Engine", "Unity"]],
    ["Tools", ["Git", "Visual Studio", "Rider", "CLion"]],
  ];
  const lit = new Set(["C++", "Unreal Engine"]); // the main axis, lit by the one practical
  const W = 1200, H = 290;
  await render("stack.svg",
    frame(W, H, h("div", { flexDirection: "column", justifyContent: "center", gap: 20, flex: 1, padding: "0 44px" },
      ...rows.map(([label, items]) => h("div", { alignItems: "center" },
        h("div", { width: 210 }, monoText(label, 14)),
        h("div", { gap: 12 }, ...items.map((t) => h("span", {
          background: lit.has(t) ? C.chroma : "transparent", border: `1.5px solid ${lit.has(t) ? C.chroma : C.edge}`,
          color: lit.has(t) ? C.chromaOn : C.ink, fontWeight: lit.has(t) ? 600 : 400,
          fontFamily: MONO, fontSize: 17, letterSpacing: 1, padding: "9px 17px" }, t))))))),
    W, H);
}

// ---- End -------------------------------------------------------------------------------
async function tail() {
  const W = 1200, H = 110;
  await render("tail.svg",
    h("div", { width: W, height: H, background: C.base, padding: "0 28px" },
      h("div", { flex: 1, alignItems: "center", gap: 22, borderTop: `1px solid ${C.edge}`, marginTop: 14 },
        chip(P.frameSlates.tail.role.en.toUpperCase(), 16),
        monoText("Thanks for scrolling", 15, C.ink2))),
    W, H, { grain: 0.04 });
}

// ---- Build -----------------------------------------------------------------------------
if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith(".svg")) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });

await header();
await link("link-portfolio.svg", "Portfolio", true);
await link("link-linkedin.svg", "LinkedIn");
await link("link-email.svg", "Email");
await section("section-work.svg", "002", P.frameSlates.work.role.en);
for (const [i, p] of P.projects.entries()) await card(p, i);
await section("section-stack.svg", "003", "Stack");
await stack();
await section("section-telemetry.svg", "004", "Telemetry");
await tail();
