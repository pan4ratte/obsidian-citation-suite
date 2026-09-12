import { moment } from "obsidian";
import en from "lang/en";
import ru from "lang/ru";
import changelogEn from "../CHANGELOG.md";
import changelogRu from "../CHANGELOG_RU.md";

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
