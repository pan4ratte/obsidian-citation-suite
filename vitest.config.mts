import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
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
