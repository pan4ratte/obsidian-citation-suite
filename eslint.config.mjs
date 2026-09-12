import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
	globalIgnores(["main.js", "node_modules/**"]),

	// Official Obsidian plugin guidelines ruleset. Bundles eslint:recommended,
	// typescript-eslint recommended-type-checked, import, depend, no-unsanitized
	// and manifest/license validation. The `WithLocalesEn` variant adds the
	// sentence-case check over `lang/en.ts`, which is where every user-facing
	// string lives, and bans the disable comment for it.
	obsidianmd.configs.recommendedWithLocalesEn,

	{
		// `.mts` is here too: the obsidianmd preset parses it as TypeScript and
		// turns the type-checked rules on for it, and a rule of that kind fails
		// to load rather than report when no project service is wired up for the
		// file it is asked about.
		files: ["**/*.ts", "**/*.mts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.browser,
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",

			// The recommended set turns on `fixToUnknown`, whose autofix
			// rewrites `any` to `unknown` and breaks every call site that
			// dereferences it. Keep the report, drop the fixer.
			"@typescript-eslint/no-explicit-any": [
				"warn",
				{ fixToUnknown: false },
			],

			// `brands` and `ignoreWords` replace the rule's default lists
			// rather than adding to them, so anything that has to keep its
			// capital — Obsidian included — is named here.
			//
			// "pandoc" is lowercase in its own documentation and in the
			// citation syntax it names, so it is an ignored word rather than a
			// brand: the rule would otherwise capitalise it.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					ignoreWords: ["pandoc", "citekey", "citekeys"],
				},
			],
			"obsidianmd/ui/sentence-case-locale-module": [
				"warn",
				{
					brands: [
						"Zoterik",
						"Obsidian",
						"Zotero",
						"Better BibTeX",
						"BibTeX",
					],
					ignoreWords: ["pandoc", "citekey", "citekeys"],
				},
			],
		},
	},

	{
		files: ["tests/**/*.ts"],
		rules: {
			// Tests reach for Zotero-shaped fixtures, not the plugin's UI.
			"obsidianmd/ui/sentence-case": "off",
		},
	},

	// Build tooling runs in Node, outside the plugin sandbox. The configs are
	// not part of the program tsconfig describes, so the type-checked rules
	// have nothing to read for them and error out rather than report; they are
	// turned off here instead of being given a project of their own.
	{
		files: ["*.mjs", "*.mts"],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
]);
