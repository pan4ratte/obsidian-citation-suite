import { lang } from "lang/helpers";

/**
 * The source the settings preview cites.
 *
 * The preview has to show a style at work without Zotero being asked for
 * anything — it is drawn while the reader is choosing, and Zotero may not even
 * be running — so it cites a source the plugin carries itself: one well-known
 * book, in the edition a reader of the interface language would cite.
 *
 * The id is not a pandoc citation key and cannot become one, because it holds a
 * space. The renderer keeps every item it is given by id, beside the reader's
 * own; a sample that could share a key with a real source would, for a moment,
 * be drawn in its place.
 */

/** One source in the CSL JSON citeproc reads. */
export interface SampleSource {
	/** The key a note would cite it by, for the preview of an unstyled citation. */
	citekey: string;
	item: { id: string; [field: string]: unknown };
}

const SAMPLE_ID = "citation suite sample";

const SAMPLES: Record<string, SampleSource> = {
	en: {
		citekey: "kuhn1962",
		item: {
			id: SAMPLE_ID,
			type: "book",
			title: "The Structure of Scientific Revolutions",
			author: [{ family: "Kuhn", given: "Thomas S." }],
			publisher: "University of Chicago Press",
			"publisher-place": "Chicago",
			issued: { "date-parts": [[1962]] },
			language: "en",
		},
	},
	ru: {
		citekey: "kuhn1975",
		item: {
			id: SAMPLE_ID,
			type: "book",
			title: "Структура научных революций",
			author: [{ family: "Кун", given: "Томас" }],
			publisher: "Прогресс",
			"publisher-place": "Москва",
			issued: { "date-parts": [[1975]] },
			language: "ru",
		},
	},
};

/** The sample for the interface language, English for any other. */
export function sampleSource(): SampleSource {
	return SAMPLES[lang] ?? SAMPLES.en;
}
