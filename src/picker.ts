import { debounce } from "obsidian";

/** One entry of the list: what is stored when it is chosen, and what is read. */
export interface PickerChoice {
	id: string;
	title: string;
	/**
	 * A caption drawn above this entry, with a rule running off it: this entry
	 * and the ones after it are a group of their own, and the caption says
	 * what the group is. What the groups are is the settings tab's to say; the
	 * list only draws the caption it is given.
	 */
	group?: string;
}

/**
 * How long the arrow keys have to rest before the entry they landed on is
 * saved. Choosing rebuilds the renderer and redraws every open note, which is
 * fine once and wasteful a dozen times while the reader walks down the list to
 * the entry they want.
 */
const KEY_SETTLE_MS = 300;

/** What a list is drawn from. */
export interface PickerOptions {
	/** What the list is, for a screen reader to announce it by. */
	label: string;
	choices: PickerChoice[];
	/** The `id` of the entry marked when the list is drawn. */
	chosen: string;
	onChoose: (id: string) => void;
	/**
	 * What is written under the list when the only entry in it is the one that
	 * is not a choice at all — no styles installed, say — since a list of one
	 * explains nothing on its own. A list that is never drawn empty, because
	 * its whole section is left out when there is nothing to choose, leaves
	 * this out.
	 */
	empty?: string;
}

/**
 * A list chosen from in the settings tab itself, laid out the way Zotero's
 * "Document preferences" window lists styles: every entry in one scrolling
 * box, the chosen one marked. The citation style is chosen from one, and the
 * bibliography the notes read from another.
 *
 * A dropdown held the styles before, and it did not hold them well. Zotero
 * ships a dozen styles and a reader installs more, their titles run to the
 * width of a sentence, and a native dropdown shows a handful at a time in a
 * menu as wide as the longest of them. A list that scrolls shows many at once,
 * and it is the list a Zotero user already knows.
 *
 * It behaves as a list box does: clicking an entry chooses it, and the arrow
 * keys, Home and End move the choice once the list has focus. Every choice is
 * saved — the settings tab has no OK to wait for — but a run of key presses is
 * saved once, when it stops.
 *
 * Returns what the settings row calls when it is torn down: a choice still
 * waiting out the key delay is saved then rather than lost.
 */
export function renderPicker(
	parent: HTMLElement,
	{ label, choices, chosen, onChoose, empty }: PickerOptions
): () => void {
	const picker = parent.createDiv({ cls: "citation-suite-picker" });
	const list = picker.createDiv({
		cls: "citation-suite-picker-list",
		attr: {
			role: "listbox",
			tabindex: "0",
			"aria-label": label,
		},
	});

	let marked = chosen;
	let saved = chosen;
	const rows = new Map<string, HTMLElement>();

	const save = debounce(
		() => {
			if (marked !== saved) {
				saved = marked;
				onChoose(marked);
			}
		},
		KEY_SETTLE_MS,
		true
	);

	/**
	 * Scrolls the list, and only the list, so that the row is in it. The row's
	 * own `scrollIntoView` would scroll the settings pane along with it.
	 * `offsetTop` is measured from the list's padding edge, which is where
	 * `scrollTop` counts from too, because styles.css makes the list the rows'
	 * offset parent.
	 */
	const reveal = (row: HTMLElement, centre: boolean): void => {
		const top = row.offsetTop;
		const bottom = top + row.offsetHeight;
		if (centre) {
			list.scrollTop = top - (list.clientHeight - row.offsetHeight) / 2;
		} else if (top < list.scrollTop) {
			list.scrollTop = top;
		} else if (bottom > list.scrollTop + list.clientHeight) {
			list.scrollTop = bottom - list.clientHeight;
		}
	};

	const mark = (id: string): void => {
		const previous = rows.get(marked);
		previous?.removeClass("is-selected");
		previous?.setAttribute("aria-selected", "false");
		marked = id;
		const row = rows.get(id);
		row?.addClass("is-selected");
		row?.setAttribute("aria-selected", "true");
		if (row) {
			reveal(row, false);
		}
	};

	for (const choice of choices) {
		if (choice.group) {
			// The caption is the rule's name rather than an entry of the list,
			// so the text inside it is not read out a second time.
			list.createDiv({
				cls: "citation-suite-picker-group",
				attr: { role: "separator", "aria-label": choice.group },
			}).createSpan({ text: choice.group });
		}
		const row = list.createDiv({
			cls: "citation-suite-picker-item",
			text: choice.title,
			attr: { role: "option", "aria-selected": "false" },
		});
		row.addEventListener("click", () => {
			mark(choice.id);
			save();
			save.run();
		});
		rows.set(choice.id, row);
	}

	list.addEventListener("keydown", (evt: KeyboardEvent) => {
		const at = Math.max(
			0,
			choices.findIndex((choice) => choice.id === marked)
		);
		const target: Record<string, number> = {
			ArrowDown: at + 1,
			ArrowUp: at - 1,
			Home: 0,
			End: choices.length - 1,
		};
		if (!(evt.key in target)) {
			return;
		}
		evt.preventDefault();
		const next =
			choices[Math.min(choices.length - 1, Math.max(0, target[evt.key]))];
		if (next && next.id !== marked) {
			mark(next.id);
			save();
		}
	});

	// Only the entry that is not a choice is in the list, and an explanation
	// reads better than a list of one.
	if (empty && choices.length <= 1) {
		picker.createDiv({
			cls: "citation-suite-picker-empty",
			text: empty,
		});
	}

	mark(chosen);
	// The row has no position until the list is laid out, and the settings
	// tab lays it out after this returns.
	list.win.requestAnimationFrame(() => {
		const row = rows.get(marked);
		if (row) {
			reveal(row, true);
		}
	});

	return () => {
		save.run();
	};
}
