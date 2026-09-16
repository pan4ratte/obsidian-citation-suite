import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	// The locales and the changelogs are imported as text, which esbuild does
	// through its loaders (`esbuild.config.mjs`) and vite does not. Without
	// this, a test that reaches `src/render.ts` fails on the first `.xml` it
	// imports rather than on anything it meant to check.
	plugins: [
		{
			name: "text-imports",
			transform(code: string, id: string) {
				if (!/[.](xml|md)$/.test(id)) {
					return null;
				}
				return {
					code: `export default ${JSON.stringify(code)};`,
					map: null,
				};
			},
		},
	],
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			// The source imports its own modules by package-root path, the way
			// tsconfig's `paths` resolves them.
			src: dir("./src"),
			lang: dir("./lang"),
			// `obsidian` is provided by the app at run time and by nothing at
			// all here.
			obsidian: dir("./tests/mocks/obsidian.ts"),
		},
	},
});
