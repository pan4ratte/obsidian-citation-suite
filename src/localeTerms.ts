import { LocatorLabels } from "src/citation";
import { LabelWriter, shortLabel } from "src/pandoc";

/**
 * The words a locator is labelled with in a language, read out of CSL — the
 * way pandoc reads them in a note, and the way the plugin writes them so that
 * pandoc can.
 *
 * Pandoc reads a locator's label in the note's language and in no other: with
 * `lang: ru-RU`, `[@doe2020, с. 33]` cites page 33 and `[@doe2020, p. 33]`
 * does not — `p. 33` is written out as it stands. It reads fifteen locators
 * (`PANDOC_LOCATORS`), by their terms in every form (long, short, symbol) and
 * number, matched exactly but for case (en-GB's `bk` is a book, `bk.` is not),
 * and by their CSL names (`page 3` is read in any language). The terms are the
 * style's own `<locale>` terms for the language together with the locale
 * file's — IEEE's `<locale xml:lang="en">` adds `ch.` to the file's `chap.`,
 * and pandoc reads both — and `en-US`'s only for a locator neither of them
 * names. All of that was checked against pandoc 3.11 with a style that prints
 * the label it parsed.
 *
 * Pure: the style and the locale files are handed in as text.
 */

/**
 * The locators pandoc reads a label for. Appendix, canon, rule, scene, table,
 * sub verbo and the rest are CSL locators too, but pandoc 3.11 read none of
 * them, by any term or by name, in any language.
 */
export const PANDOC_LOCATORS = [
	"book",
	"chapter",
	"column",
	"figure",
	"folio",
	"issue",
	"line",
	"note",
	"opus",
	"page",
	"paragraph",
	"part",
	"section",
	"verse",
	"volume",
];

/** A term's words, one and several. */
interface TermWords {
	single: string;
	multiple: string;
}

/** A locator's term by form — long, short or symbol. */
type Forms = Map<string, TermWords>;

/** Every locator term the XML defines, by locator and then by form. */
function termForms(xml: string): Map<string, Forms> {
	const terms = new Map<string, Forms>();
	const pattern = /<term\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/term>/g;
	for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
		const [, name, attributes, body] = match;
		const form = /\bform="([^"]+)"/.exec(attributes)?.[1] ?? "long";
		if (!PANDOC_LOCATORS.includes(name) || form.startsWith("verb")) {
			continue;
		}
		const single = /<single>([^<]*)<\/single>/.exec(body)?.[1] ?? body;
		const multiple = /<multiple>([^<]*)<\/multiple>/.exec(body)?.[1] ?? single;
		const forms = terms.get(name) ?? new Map<string, TermWords>();
		forms.set(form, { single: single.trim(), multiple: multiple.trim() });
		terms.set(name, forms);
	}
	return terms;
}

/**
 * The `<locale>` blocks of a style that speak for a locale, the most particular
 * first: the one for the locale itself (`en-US`), the one for its language
 * (`en`), and the one for every language.
 */
function styleLocales(style: string, locale: string): string[] {
	const language = locale.split("-")[0];
	// A comment can talk about a locale without being one.
	style = style.replace(/<!--[\s\S]*?-->/g, "");
	const blocks: { rank: number; body: string }[] = [];
	const pattern = /<locale(?:\s+xml:lang="([^"]*)")?\s*>([\s\S]*?)<\/locale>/g;
	for (let match = pattern.exec(style); match; match = pattern.exec(style)) {
		const lang = match[1] ?? "";
		const rank = lang === locale ? 0 : lang === language ? 1 : lang === "" ? 2 : -1;
		if (rank !== -1) {
			blocks.push({ rank, body: match[2] });
		}
	}
	return blocks.sort((a, b) => a.rank - b.rank).map((block) => block.body);
}

/** A label is one word: pandoc splits a locator from its label at the first space. */
function oneWord(word: string): boolean {
	return word !== "" && !/\s/.test(word);
}

/**
 * The labels a note in `locale` reads locators with: each word, lowercased,
 * mapped to its CSL locator. `localeXml` is the locale's file, `fallbackXml`
 * `en-US`'s, and `style` the style the note is written in, whose own terms
 * are read too.
 */
export function localeLabels(
	localeXml: string,
	fallbackXml: string,
	style = "",
	locale = ""
): LocatorLabels {
	const own = [...styleLocales(style, locale), localeXml].map(termForms);
	const fallback = termForms(fallbackXml);
	const labels: LocatorLabels = {};
	for (const locator of PANDOC_LOCATORS) {
		labels[locator] = locator;
		const named = own.filter((source) => source.has(locator));
		for (const source of named.length > 0 ? named : [fallback]) {
			for (const { single, multiple } of source.get(locator)?.values() ?? []) {
				for (const word of [single, multiple].filter(oneWord)) {
					labels[word.toLocaleLowerCase()] = locator;
				}
			}
		}
	}
	return labels;
}

/**
 * How the plugin writes a locator's label in a note pandoc reads in a locale:
 * the locale's short term — `p.`, `pp.`, `с.`, `S.` — or its long one where
 * there is no short one in a word, from `en-US` for a locator the locale does
 * not name. Pass `null` for a language the plugin carries no locale for: the
 * CSL name is written then (`page 33`), which pandoc reads in any language.
 *
 * A label pandoc does not read at all — sub verbo, appendix, Juris-M's — is
 * written the way Better BibTeX abbreviates it, since no word would be read.
 */
export function labelWriter(
	localeXml: string | null,
	fallbackXml: string
): LabelWriter {
	const own = localeXml === null ? null : termForms(localeXml);
	const fallback = termForms(fallbackXml);
	return (label, plural) => {
		if (!PANDOC_LOCATORS.includes(label)) {
			return shortLabel(label);
		}
		if (own === null) {
			return label;
		}
		const forms = own.get(label) ?? fallback.get(label);
		for (const form of ["short", "long"]) {
			const words = forms?.get(form);
			const word = words ? (plural ? words.multiple : words.single) : "";
			if (oneWord(word)) {
				return word;
			}
		}
		return label;
	};
}
