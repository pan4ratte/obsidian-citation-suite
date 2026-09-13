import { CitationUnderline, CitationSuiteSettings } from "src/types";

/**
 * How rendered citations look: their colour, the line under them, and whether
 * they are set in bold or italics.
 *
 * Both are set once, on the `<body>` of every window, rather than on each
 * citation. A citation is drawn in a note's reading view, in a live preview
 * widget, and in the settings preview, by three different pieces of code; a
 * class on the body reaches all three through styles.css, and changing the look
 * is a matter of swapping the class — nothing has to be rendered again.
 *
 * A colour the reader picked is the one value styles.css cannot hold, so it is
 * handed over as a CSS variable beside the class that says to use it.
 */

/** Every underline there is, in the order the settings offer them. */
export const UNDERLINES: CitationUnderline[] = ["dotted", "solid", "wavy", "none"];

/** The setting's value for the theme's accent colour. */
export const COLOR_ACCENT = "accent";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The variable a colour of the reader's own is handed to styles.css in. */
const CUSTOM_COLOR_VAR = "--citation-suite-citation-custom-color";

/** Every class this module ever puts on a body, so any of them can be taken off. */
const ALL_CLASSES = [
	"citation-suite-citation-color-accent",
	"citation-suite-citation-color-custom",
	"citation-suite-citation-bold",
	"citation-suite-citation-italic",
	...UNDERLINES.map((underline) => `citation-suite-citation-underline-${underline}`),
];

/** Whether the setting holds a colour of the reader's own, as `#rrggbb`. */
export function isCustomColor(color: string): boolean {
	return HEX_COLOR.test(color);
}

/** Whether the setting asks for the theme's accent colour. */
export function isAccentColor(color: string): boolean {
	return color === COLOR_ACCENT;
}

/**
 * The classes that put the settings' look on a body. A value this version does
 * not know — a hand-edited data.json — adds nothing, and the citation keeps the
 * look styles.css gives it by default.
 */
export function lookClasses(
	settings: Pick<
		CitationSuiteSettings,
		| "citationColor"
		| "citationUnderline"
		| "citationBold"
		| "citationItalic"
	>
): string[] {
	const classes: string[] = [];
	if (isAccentColor(settings.citationColor)) {
		classes.push("citation-suite-citation-color-accent");
	} else if (isCustomColor(settings.citationColor)) {
		classes.push("citation-suite-citation-color-custom");
	}
	if (UNDERLINES.includes(settings.citationUnderline)) {
		classes.push(`citation-suite-citation-underline-${settings.citationUnderline}`);
	}
	// Strictly `true`: a hand-edited "false" string is not a yes.
	if (settings.citationBold === true) {
		classes.push("citation-suite-citation-bold");
	}
	if (settings.citationItalic === true) {
		classes.push("citation-suite-citation-italic");
	}
	return classes;
}

/** Puts the look on one window's body, replacing whatever was there. */
export function applyLook(body: HTMLElement, settings: CitationSuiteSettings): void {
	clearLook(body);
	body.addClasses(lookClasses(settings));
	if (isCustomColor(settings.citationColor)) {
		body.setCssProps({ [CUSTOM_COLOR_VAR]: settings.citationColor });
	}
}

/** Takes the look off a body, for when the plugin is unloaded. */
export function clearLook(body: HTMLElement): void {
	body.removeClasses(ALL_CLASSES);
	// An empty value is how a custom property is removed.
	body.setCssProps({ [CUSTOM_COLOR_VAR]: "" });
}
