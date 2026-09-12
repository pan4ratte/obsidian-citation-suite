import esbuild from "esbuild";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	// Obsidian provides these at runtime; bundling a second copy of any of them
	// hands the plugin classes the running editor does not recognise.
	external: [
		"obsidian",
		"electron",
		"@codemirror/state",
		"@codemirror/view",
		"@codemirror/language",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	platform: "browser",
	target: "es2022",
	// The changelogs are imported as text and shipped inside main.js, and both
	// are mostly non-ASCII; escaping them would triple their size.
	charset: "utf8",
	loader: { ".md": "text", ".xml": "text" },
	outfile: "main.js",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	minify: prod,
	logLevel: "info",
});

if (prod) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
