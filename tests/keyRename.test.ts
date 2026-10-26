import { describe, expect, it } from "vitest";
import { applyEdits, citationKeysIn, keyRenameEdits } from "src/keyRename";

const renames = new Map([
	["old2020", "new2020"],
	["kuhn1962", "kuhnStructure1962"],
]);

function renamed(text: string, keys: ReadonlyMap<string, string> = renames): string {
	return applyEdits(text, keyRenameEdits(text, keys));
}

describe("keyRenameEdits", () => {
	it("rewrites a key in a bracketed citation, locator and all kept", () => {
		expect(renamed("As shown [@old2020, p. 33].")).toBe("As shown [@new2020, p. 33].");
	});

	it("rewrites every key of a group it has a new one for, and only those", () => {
		expect(renamed("[see @old2020; @roe2021; @kuhn1962, ch. 2]")).toBe(
			"[see @new2020; @roe2021; @kuhnStructure1962, ch. 2]"
		);
	});

	it("keeps the minus that suppresses the author", () => {
		expect(renamed("Kuhn says [-@kuhn1962, 12].")).toBe(
			"Kuhn says [-@kuhnStructure1962, 12]."
		);
	});

	it("rewrites a braced key, and braces a new key pandoc would cut short", () => {
		expect(renamed("[@{old2020}]")).toBe("[@new2020]");
		expect(renamed("[@old2020]", new Map([["old2020", "new key"]]))).toBe("[@{new key}]");
	});

	it("rewrites a citation standing alone, as the plugin writes one with brackets off", () => {
		expect(renamed("@old2020 [p. 33] argues, and (@kuhn1962) agrees.")).toBe(
			"@new2020 [p. 33] argues, and (@kuhnStructure1962) agrees."
		);
		expect(renamed("@old2020.\n-@old2020, again")).toBe("@new2020.\n-@new2020, again");
		expect(renamed("@old2020 @kuhn1962 (@old2020)")).toBe(
			"@new2020 @kuhnStructure1962 (@new2020)"
		);
	});

	it("leaves an address, a link and a longer key alone", () => {
		const text = "mail me@old2020 or see https://x.com/@old2020 and @old2020b, [@old2020x]";
		expect(renamed(text)).toBe(text);
	});

	it("leaves code, comments and the front matter alone", () => {
		const text =
			"---\nnocite: [@old2020]\n---\n`[@old2020]`\n```\n@old2020\n```\n%% [@old2020] %%\n<!-- @old2020 -->\n[@old2020]";
		expect(renamed(text)).toBe(
			"---\nnocite: [@old2020]\n---\n`[@old2020]`\n```\n@old2020\n```\n%% [@old2020] %%\n<!-- @old2020 -->\n[@new2020]"
		);
	});

	it("changes nothing when the text cites none of the keys", () => {
		expect(keyRenameEdits("[@roe2021] and @moe2022", renames)).toEqual([]);
	});

	it("gives changes in order, in offsets into the text", () => {
		const text = "A [@kuhn1962]. B @old2020.";
		expect(keyRenameEdits(text, renames)).toEqual([
			{ from: 3, to: 12, text: "@kuhnStructure1962" },
			{ from: 17, to: 25, text: "@new2020" },
		]);
	});
});

describe("citationKeysIn", () => {
	it("finds bracketed and standalone keys once each, in order", () => {
		expect(
			citationKeysIn("@doe2020 says [@roe2021; -@doe2020]. `@code` (@moe2022)")
		).toEqual(["doe2020", "roe2021", "moe2022"]);
	});
});
