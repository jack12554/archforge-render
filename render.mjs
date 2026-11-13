import { chromium } from "playwright";
import fs from "fs";
import { execSync } from "child_process";

const FPS = Number(process.env.FPS || 24);
const W = Number(process.env.WIDTH || 1280);
const H = Number(process.env.HEIGHT || 720);
const APP = process.env.APP_URL || "https://3d4j.netlify.app";
const PROJECT = process.env.PROJECT || "project/project.json";
const START = Number(process.env.START || 0);
const END = process.env.END ? Number(process.env.END) : null;

fs.rmSync("frames", { recursive: true, force: true });
fs.mkdirSync("frames", { recursive: true });
fs.mkdirSync("out", { recursive: true });

const project = JSON.parse(fs.readFileSync(PROJECT, "utf8"));

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});

const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${APP}/?render=1&w=${W}&h=${H}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.ArchForgeRender, null, { timeout: 90000 });

const info = await page.evaluate(
  async (p) => await window.ArchForgeRender.loadProject(p),
  project
);
console.log("Project loaded:", info);

const end = END ?? info.duration;
const total = Math.ceil((end - START) * FPS);
console.log(`Rendering ${total} frames (${START}s -> ${end}s @ ${FPS}fps, ${W}x${H})`);

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = START + i / FPS;
  await page.evaluate(async (tt) => await window.ArchForgeRender.seek(tt), t);
  await page.screenshot({
    path: `frames/${String(i + 1).padStart(6, "0")}.jpg`,
    type: "jpeg",
    quality: 92,
  });
  if (i % 24 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${i + 1}/${total}  (${el.toFixed(0)}s elapsed)`);
  }
}

await browser.close();

const name = `animation_${START}-${Math.round(end)}s.mp4`;
execSync(
  `ffmpeg -y -framerate ${FPS} -i frames/%06d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart out/${name}`,
  { stdio: "inherit" }
);
console.log("Done:", name);
