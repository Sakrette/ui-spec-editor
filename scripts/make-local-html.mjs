import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const localIndexPath = path.join(distDir, "index-local.html");

const html = await readFile(indexPath, "utf8");
const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);

if (!scriptMatch) {
  throw new Error("Could not find built script tag in dist/index.html");
}

const scriptSrc = scriptMatch[1];

const localHtml = html
  .replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    "",
  )
  .replace(
    "</body>",
    `    <script type="text/javascript" src="${scriptSrc}"></script>\n  </body>`,
  )
  .replace(/ crossorigin/g, "");

await writeFile(localIndexPath, localHtml, "utf8");
