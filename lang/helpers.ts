import { moment } from "obsidian";
import en from "lang/en";
import ru from "lang/ru";
import changelogEn from "../CHANGELOG.md";
import changelogRu from "../CHANGELOG_RU.md";
import readmeEn from "../README.md";
import readmeRu from "../README_RU.md";
import { guideOf } from "src/userGuide";

// To add a language, copy en.ts, translate the values, and list it here under
// the locale code Obsidian reports. English is the fallback for everything
// else, and `t` is typed as `typeof en`, so every locale file has to carry all
// of en.ts's keys.
const localeMap: { [key: string]: typeof en } = {
	en,
	ru,
};

/** The interface language, as Obsidian reports it: `en`, `ru`, … */
export const lang = moment.locale();
export const t = localeMap[lang] || localeMap.en;

// CHANGELOG_RU.md is the original — the release notes are written there first
// and CHANGELOG.md follows it, the same way ru.ts leads en.ts. Only the
// translations are listed; anything else falls back to English, as `t` does.
const changelogs: { [key: string]: string } = {
	ru: changelogRu,
};

/** The changelog in the interface language, for the modal to render. */
export function getChangelogContent(): string {
	return changelogs[lang] ?? changelogEn;
}

/**
 * The user guide in the interface language: the guide section of the README
 * written in it, and the section about the author after it
 * (`src/userGuide.ts`), under the headings that README gives them.
 * README_RU.md leads README.md, as the changelogs do.
 */
const userGuides: { [key: string]: string } = {
	ru: guideOf(readmeRu, {
		guide: "# Руководство пользователя",
		author: "# Об авторе",
	}),
};

export function getUserGuideContent(): string {
	return (
		userGuides[lang] ??
		guideOf(readmeEn, { guide: "# User guide", author: "# About the Author" })
	);
}
