/**
 * The user guide is the README's own: the section from its guide heading up to
 * the next top-level heading, followed by the section about the author. Taking
 * it from there rather than from a copy of its own keeps one text to write for
 * GitHub and for the modal — a guide that drifted from the README would be two
 * guides.
 */

/**
 * The lines from `heading` up to the first line after it that `stop` matches,
 * trimmed, or the empty string if the README has no such heading.
 */
function sectionOf(lines: string[], heading: string, stop: RegExp): string {
	const start = lines.findIndex((line) => line.trimEnd() === heading);
	if (start === -1) {
		return "";
	}
	const end = lines.findIndex((line, index) => index > start && stop.test(line));
	return lines
		.slice(start, end === -1 ? undefined : end)
		.join("\n")
		.trim();
}

/** The README's headings the guide is cut out by. */
export interface GuideHeadings {
	/** The guide's own top-level heading. */
	guide: string;
	/** The top-level heading of the section about the author. */
	author: string;
}

/**
 * The part of the README that is the guide, heading included, with the section
 * about the author after it, or the empty string if the README has no guide
 * heading.
 *
 * The guide runs to the next top-level heading. The author's section runs only
 * to the next heading of any level: under it the README keeps the third-party
 * licenses, which are about the bundle rather than about using the plugin.
 */
export function guideOf(readme: string, headings: GuideHeadings): string {
	const lines = readme.split("\n");
	const guide = sectionOf(lines, headings.guide, /^# /);
	if (!guide) {
		return "";
	}
	const author = sectionOf(lines, headings.author, /^#{1,6} /);
	return author ? `${guide}\n\n${author}` : guide;
}
