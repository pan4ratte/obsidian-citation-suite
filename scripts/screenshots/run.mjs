// npm run screenshots [-- name ...] [--no-build] [--keep]
//
// Retakes the README screenshots in a separate Obsidian instance and writes
// them to assets/. With names, only those shots; with --keep, the instance is
// left open after a failure, for looking at what went wrong. See docs/screenshots.md.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, SCALE } from "./obsidian.mjs";
import { installHelpers, SHOTS } from "./shots.mjs";
import { DEMO, prepareVault, REPO } from "./vault.mjs";

const args = process.argv.slice(2);
const names = args.filter((arg) => !arg.startsWith("--"));
const unknown = names.filter((name) => !SHOTS.some((shot) => shot.name === name));
if (unknown.length) {
	console.error(`Unknown shots: ${unknown.join(", ")}. Shots: ${SHOTS.map((s) => s.name).join(", ")}.`);
	process.exit(1);
}
const chosen = names.length ? SHOTS.filter((shot) => names.includes(shot.name)) : SHOTS;

if (!args.includes("--no-build")) {
	const build = spawnSync("npm run build", { cwd: REPO, stdio: "inherit", shell: true });
	if (build.status !== 0) process.exit(build.status ?? 1);
}

let context;
try {
	context = await prepareVault();
} catch (error) {
	console.error(
		error instanceof TypeError && String(error.cause ?? "").includes("ECONNREFUSED")
			? "Zotero with Better BibTeX has to be running: the demo vault's .bib and key index come from it."
			: error.message
	);
	process.exit(1);
}
console.log(`Demo vault: ${context.vault}`);

let { page, child } = await launch(context.vault);
try {
	await installHelpers(page, DEMO.chapter);
	for (const shot of chosen) {
		process.stdout.write(`${shot.name}… `);
		const result = await shot.run(page, context);
		const panels = Array.isArray(result) ? result : result.panels;
		if (!Array.isArray(result)) page = result.page;
		const framed = await page.call(
			(data, options) => window.__shot.frame(data, options),
			panels.map((panel) => panel.toString("base64")),
			{ radius: shot.radius, stroke: Math.round(SCALE * 1.5), gap: Math.round(SCALE * 40) }
		);
		const file = join(REPO, "assets", `${shot.name}.png`);
		writeFileSync(file, Buffer.from(framed, "base64"));
		console.log("saved");
	}
	await quit(page, child);
} catch (error) {
	if (args.includes("--keep")) {
		console.error("The instance is left open (--keep); its DevTools are on port 9333.");
	} else {
		await quit(page, child);
	}
	throw error;
}
