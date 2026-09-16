import { describe, expect, it } from "vitest";
import { parseStyle, withoutCitationNumbers } from "src/styles";

/** The head of a CSL file, which is all the reader of one looks at. */
function csl(info: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
${info}
    <updated>2024-01-01T00:00:00+00:00</updated>
  </info>
  <citation><layout></layout></citation>
</style>`;
}

describe("parseStyle", () => {
	it("reads the id and the title a style declares", () => {
		expect(
			parseStyle(
				csl(
					'    <title>APA Style 7th edition</title>\n' +
						"    <id>http://www.zotero.org/styles/apa</id>"
				)
			)
		).toEqual({
			id: "http://www.zotero.org/styles/apa",
			title: "APA Style 7th edition",
			path: "",
			source: "zotero",
		});
	});

	it("reads a style installed by hand, whose id is a bare UUID", () => {
		const style = parseStyle(
			csl(
				"    <title>ГОСТ Р 7.0.100-2018</title>\n" +
					"    <id>ab91f1f3-21ac-5238-b2f1-6ef3ec74c680</id>"
			)
		);
		expect(style?.id).toBe("ab91f1f3-21ac-5238-b2f1-6ef3ec74c680");
		expect(style?.title).toBe("ГОСТ Р 7.0.100-2018");
	});

	it("decodes the entities a title is written with", () => {
		const style = parseStyle(
			csl(
				"    <title>Ecology &amp; Society</title>\n" +
					"    <id>http://www.zotero.org/styles/ecology</id>"
			)
		);
		expect(style?.title).toBe("Ecology & Society");
	});

	it("is not fooled by the short title next to the real one", () => {
		const style = parseStyle(
			csl(
				"    <title>Chicago Manual of Style</title>\n" +
					"    <title-short>Chicago</title-short>\n" +
					"    <id>http://www.zotero.org/styles/chicago</id>"
			)
		);
		expect(style?.title).toBe("Chicago Manual of Style");
	});

	it("refuses a file with no id or no title to offer", () => {
		expect(parseStyle(csl("    <title>Untitled</title>"))).toBeNull();
		expect(parseStyle(csl("    <id>urn:x</id>"))).toBeNull();
		expect(parseStyle("not a style at all")).toBeNull();
	});
});

describe("withoutCitationNumbers", () => {
	it("takes the number out together with the affixes around it", () => {
		expect(
			withoutCitationNumbers(
				'<layout><text variable="citation-number" prefix="[" suffix="]"/>' +
					'<text macro="author"/></layout>'
			)
		).toBe('<layout><text macro="author"/></layout>');
	});

	it("takes it out however the element is written", () => {
		expect(
			withoutCitationNumbers(
				"<group><number variable='citation-number' suffix='. '></number>" +
					'<text variable="citation-number"></text>' +
					'<text  suffix=". "  variable = "citation-number" />' +
					'<text variable="title"/></group>'
			)
		).toBe('<group><text variable="title"/></group>');
	});

	it("leaves sorting and conditions on the number alone", () => {
		const csl =
			'<sort><key variable="citation-number"/></sort>' +
			'<if variable="citation-number"><text variable="title"/></if>';
		expect(withoutCitationNumbers(csl)).toBe(csl);
	});

	it("does not reach variables that only start with the same name", () => {
		const csl = '<text variable="citation-label"/>';
		expect(withoutCitationNumbers(csl)).toBe(csl);
	});

	it("drops the alignment that set the number apart", () => {
		expect(
			withoutCitationNumbers(
				'<bibliography et-al-min="7" second-field-align="flush" hanging-indent="true">'
			)
		).toBe('<bibliography et-al-min="7" hanging-indent="true">');
	});
});
