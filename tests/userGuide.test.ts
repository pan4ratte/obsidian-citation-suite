import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { guideOf } from "src/userGuide";

const HEADINGS = { guide: "# User guide", author: "# About the Author" };

describe("guideOf", () => {
	const readme = [
		"# Plugin",
		"",
		"Intro.",
		"",
		"# User guide",
		"",
		"## 1. Requirements",
		"",
		"# About the Author",
		"",
		"Bio.",
		"",
		"## Third-party licenses",
		"",
		"* citeproc-js",
	].join("\n");

	it("takes the guide, then the author's section up to its first subheading", () => {
		expect(guideOf(readme, HEADINGS)).toBe(
			"# User guide\n\n## 1. Requirements\n\n# About the Author\n\nBio."
		);
	});

	it("is the guide alone when the README has no section about the author", () => {
		expect(
			guideOf(readme, { guide: "# User guide", author: "# Author" })
		).toBe("# User guide\n\n## 1. Requirements");
	});

	it("is empty when the README has no guide heading", () => {
		expect(guideOf(readme, { ...HEADINGS, guide: "# Guide" })).toBe("");
	});

	// The modal reads the READMEs as they are shipped, so a renamed heading
	// would leave it empty, or without the author, and nothing else would fail.
	it("finds the guide and the author in both READMEs the plugin ships", () => {
		for (const [file, headings, licenses] of [
			[
				"README_RU.md",
				{ guide: "# Руководство пользователя", author: "# Об авторе" },
				"Сторонние лицензии",
			],
			["README.md", HEADINGS, "Third-party licenses"],
		] as const) {
			const guide = guideOf(readFileSync(file, "utf8"), headings);
			expect(guide.startsWith(headings.guide)).toBe(true);
			expect(guide).toContain("## 2.");
			expect(guide).toContain(`\n${headings.author}\n`);
			expect(guide).toContain("pan4ratte");
			expect(guide).not.toContain(licenses);
		}
	});
});
