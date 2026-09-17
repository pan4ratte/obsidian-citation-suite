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
			// "Pandoc" is a brand in the interface text, written with its capital
			// the way the manifest, the READMEs and ru.ts write it. The plain
			// sentence-case rule, which reads the source rather than the locale
			// module, still ignores the lowercase word: code comments and the
			// citation syntax name the `pandoc` command.
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
						"Citation Suite",
						"Obsidian",
						"Pandoc",
						"Zotero",
						"Better BibTeX",
						"BibTeX",
					],
					ignoreWords: ["citekey", "citekeys"],
				},
			],
		},
	},

	{
		files: ["tests/**/*.ts"],
		rules: {
			// Tests reach for Zotero-shaped fixtures, not the plugin's UI.
			"obsidianmd/ui/sentence-case": "off",
			// They run in Node, where the window the rule points at is what
			// has to be stood in for.
			"obsidianmd/no-global-this": "off",
		},
	},

	// The one module that reads the disk, and the tests, which run in Node.
	//
	// `src/zoteroStyles.ts` reaches for `fs`, `os` and `path`, which it does
	// with `require` behind `Platform.isDesktopApp` rather than by importing
	// them: the rule, and Obsidian's plugin review with it, reads the module
	// rather than what loads it, and a static import there is reported however
	// the module is loaded. It needs Node's globals all the same — `require`,
	// `process` and `Buffer` — and so do the tests, which run in Node and read
	// the plugin's own files off the disk to check them.
	{
		files: ["src/zoteroStyles.ts", "tests/**/*.ts"],
		languageOptions: {
			globals: globals.node,
		},
	},

	// The tests are not shipped and never run on a phone, so what they import
	// is their own business.
	{
		files: ["tests/**/*.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
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
