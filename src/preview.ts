import { debounce, setIcon, setTooltip } from "obsidian";
import { lang, t } from "lang/helpers";
import { footnoteLabel } from "src/footnote";
import {
	COLOR_ACCENT,
	isAccentColor,
	isCustomColor,
	UNDERLINES,
} from "src/look";
import type CitationSuitePlugin from "src/main";
import { citationEl } from "src/reading";
import { sampleSource } from "src/sample";
import { CitationUnderline, PreviewMode } from "src/types";

/**
 * How long a colour being dragged about in the picker has to rest before it is
 * written to disk. The look itself follows the pointer; only the saving waits.
 */
const SAVE_SETTLE_MS = 400;

/** What an accent colour the theme cannot be asked for falls back to. */
const FALLBACK_ACCENT = "#8a5cf5";

/** The icon and the tooltip each underline's button carries. */
const UNDERLINE_BUTTONS: Record<
	CitationUnderline,
	{ icon: string; tooltip: string }
> = {
	dotted: { icon: "ellipsis", tooltip: t.LOOK_UNDERLINE_DOTTED },
	solid: { icon: "minus", tooltip: t.LOOK_UNDERLINE_SOLID },
	wavy: { icon: "waves", tooltip: t.LOOK_UNDERLINE_WAVY },
	none: { icon: "remove-formatting", tooltip: t.LOOK_UNDERLINE_NONE },
};

/**
 * The icon and the tooltip each preview mode's button carries, in the order the
 * bar shows them. The icons are the ones Obsidian's own view header switches
 * between: an open book for reading view, a pen for editing.
 */
const MODE_BUTTONS: Record<PreviewMode, { icon: string; tooltip: string }> = {
	reading: { icon: "book-open", tooltip: t.PREVIEW_MODE_READING },
	source: { icon: "code-xml", tooltip: t.PREVIEW_MODE_SOURCE },
	live: { icon: "pen-line", tooltip: t.PREVIEW_MODE_LIVE },
};

/** What the settings row holds on to: redraw the sample, or let go of it. */
export interface StylePreview {
	refresh(): void;
	destroy(): void;
}

/**
 * A sentence citing a sample source in the chosen style, under a bar of buttons
 * that change how citations look — the settings row's answer to "what will my
 * notes look like?", asked without leaving the settings.
 *
 * The citation is drawn by the same code a note's reading view uses, so it
 * carries the same class, the same tooltip and the same look. The bar's buttons
 * change the look the way it is changed everywhere, on the window's body, and
 * the preview shows it because it is in that window: there is nothing to
 * redraw. Only a change of style redraws the sample.
 *
 * Every option is a button of its own in the bar, in three groups — colour,
 * underline, emphasis — and the ones in effect are pressed, so the whole look
 * can be read off the bar at a glance and changed in one click.
 *
 * Beside the title, three more switch the view the sample is shown in: reading
 * view, source mode and live preview, each drawn as that view draws a note.
 */
export function renderStylePreview(
	parent: HTMLElement,
	plugin: CitationSuitePlugin
): StylePreview {
	const settings = plugin.settings;
	const preview = parent.createDiv({ cls: "citation-suite-style-preview" });

	const bar = preview.createDiv({ cls: "citation-suite-style-preview-bar" });
	const heading = bar.createDiv({ cls: "citation-suite-style-preview-heading" });
	heading.createDiv({
		cls: "citation-suite-style-preview-title",
		text: t.PREVIEW_TITLE,
	});
	const actions = bar.createDiv({ cls: "citation-suite-style-preview-actions" });

	const body = preview.createDiv({ cls: "citation-suite-style-preview-body" });

	const save = debounce(
		() => void plugin.saveSettings(),
		SAVE_SETTLE_MS,
		true
	);

	/** Every button, with what says whether it is pressed. */
	const buttons: { el: HTMLElement; pressed: () => boolean }[] = [];

	const sync = (): void => {
		for (const { el, pressed } of buttons) {
			const on = pressed();
			el.toggleClass("is-active", on);
			el.setAttribute("aria-pressed", String(on));
		}
	};

	/**
	 * Applies a change to the look and saves it — at once, or, while a colour
	 * is still being dragged about in the picker, once it settles.
	 */
	const change = (apply: () => void, settle = false): void => {
		apply();
		plugin.applyLook();
		sync();
		save();
		if (!settle) {
			save.run();
		}
	};

	const group = (label: string): HTMLElement =>
		actions.createDiv({
			cls: "citation-suite-style-preview-group",
			attr: { role: "group", "aria-label": label },
		});

	const addButton = (
		groupEl: HTMLElement,
		icon: string,
		tooltip: string,
		pressed: () => boolean,
		onClick: () => void
	): HTMLElement => {
		const el = groupEl.createEl("button", { cls: "clickable-icon" });
		setIcon(el, icon);
		setTooltip(el, tooltip);
		el.addEventListener("click", onClick);
		buttons.push({ el, pressed });
		return el;
	};

	// ─── Mode ─────────────────────────────────────────────────────────────────

	// Not part of the look: it changes nothing outside this box, so it redraws
	// the sample rather than restyling every window.
	const modes = heading.createDiv({
		cls: "citation-suite-style-preview-group",
		attr: { role: "group", "aria-label": t.PREVIEW_MODE },
	});
	for (const [mode, { icon, tooltip }] of Object.entries(MODE_BUTTONS) as [
		PreviewMode,
		{ icon: string; tooltip: string },
	][]) {
		addButton(
			modes,
			icon,
			tooltip,
			() => settings.previewMode === mode,
			() => {
				settings.previewMode = mode;
				sync();
				save();
				save.run();
				refresh();
			}
		);
	}

	// ─── Colour ───────────────────────────────────────────────────────────────

	const colors = group(t.LOOK_COLOR);
	addButton(
		colors,
		"baseline",
		t.LOOK_COLOR_TEXT,
		() =>
			!isAccentColor(settings.citationColor) &&
			!isCustomColor(settings.citationColor),
		() => change(() => (settings.citationColor = ""))
	);
	addButton(
		colors,
		"droplet",
		t.LOOK_COLOR_ACCENT,
		() => isAccentColor(settings.citationColor),
		() => change(() => (settings.citationColor = COLOR_ACCENT))
	);

	// The native colour picker. It is never seen itself: it sits under the
	// colour buttons, so that the picker opens next to them.
	const colorInput = colors.createEl("input", {
		cls: "citation-suite-style-preview-color-input",
		attr: { type: "color", tabindex: "-1", "aria-hidden": "true" },
	});
	const setCustom = (settle: boolean): void =>
		change(() => (settings.citationColor = colorInput.value), settle);
	colorInput.addEventListener("input", () => setCustom(true));
	colorInput.addEventListener("change", () => setCustom(false));

	const customButton = addButton(
		colors,
		"pipette",
		t.LOOK_COLOR_CUSTOM,
		() => isCustomColor(settings.citationColor),
		() => {
			// Pressing the button already chooses a custom colour, starting
			// from the one in use — or, the first time, from the theme's
			// accent, the nearest thing to a colour already chosen.
			const current = settings.citationColor;
			colorInput.value = isCustomColor(current)
				? current
				: accentHex(actions);
			setCustom(false);
			try {
				colorInput.showPicker();
			} catch {
				colorInput.click();
			}
		}
	);
	customButton.addClass("citation-suite-style-preview-custom");
	// The custom colour itself, as a dot on its button while it is in use.
	customButton.createSpan({ cls: "citation-suite-style-preview-swatch" });

	actions.createDiv({ cls: "citation-suite-style-preview-separator" });

	// ─── Underline ────────────────────────────────────────────────────────────

	const underlines = group(t.LOOK_UNDERLINE);
	for (const underline of UNDERLINES) {
		addButton(
			underlines,
			UNDERLINE_BUTTONS[underline].icon,
			UNDERLINE_BUTTONS[underline].tooltip,
			() => settings.citationUnderline === underline,
			() => change(() => (settings.citationUnderline = underline))
		);
	}

	actions.createDiv({ cls: "citation-suite-style-preview-separator" });

	// ─── Emphasis ─────────────────────────────────────────────────────────────

	const emphasis = group(t.LOOK_EMPHASIS);
	addButton(
		emphasis,
		"bold",
		t.LOOK_BOLD,
		() => settings.citationBold === true,
		() =>
			change(() => (settings.citationBold = settings.citationBold !== true))
	);
	addButton(
		emphasis,
		"italic",
		t.LOOK_ITALIC,
		() => settings.citationItalic === true,
		() =>
			change(
				() => (settings.citationItalic = settings.citationItalic !== true)
			)
	);

	sync();

	// ─── Sample ───────────────────────────────────────────────────────────────

	// A style is rendered asynchronously, and the reader can choose the next
	// one before the last has come back. Only the latest may draw.
	let generation = 0;

	const refresh = (): void => {
		const current = ++generation;
		const source = sampleSource();
		const styleId = settings.citationStyle;
		const mode = settings.previewMode;
		const written = settings.brackets
			? `[@${source.citekey}]`
			: `@${source.citekey}`;

		const draw = (citation: Node): void => {
			if (current !== generation) {
				return;
			}
			body.empty();
			if (settings.footnotes) {
				drawFootnote(mode, citation);
			} else {
				drawInline(citation);
			}
		};

		// Source mode shows the note as it is written, whatever the style.
		if (mode === "source") {
			draw(activeDocument.createTextNode(written));
			return;
		}
		// Not rendered at all, or not renderable: the citation as a note holds
		// it, which is also what a note would show.
		const unstyled = (): HTMLElement =>
			createSpan({ cls: "citation-suite-style-preview-source", text: written });

		if (!styleId) {
			draw(unstyled());
			return;
		}
		void plugin.renderer.sample(styleId, source.item).then((rendered) => {
			draw(
				rendered
					? citationEl(rendered, written, plugin.citationTooltip())
					: unstyled()
			);
		});
	};

	/** The sentence with the citation in it, as every view draws it alike. */
	const drawInline = (citation: Node): void => {
		const text = body.createEl("p", { cls: "citation-suite-style-preview-text" });
		text.appendText(`${t.PREVIEW_SENTENCE} `);
		text.appendChild(citation);
		// A note style writes the whole footnote, full stop included, and a
		// second one after it would read as a typo.
		if (!/[.!?…]$/.test((citation.textContent ?? "").trim())) {
			text.appendText(".");
		}
	};

	/**
	 * The sentence with a footnote's anchor in it, and the footnote holding the
	 * citation under it, both labelled as a note's first footnote would be.
	 *
	 * Reading view sets the anchor as a superscript and the footnote under a
	 * rule. Source mode and live preview both show the note's own `[^1]` and
	 * `[^1]:`, small and raised, the brackets fainter than the label — the two
	 * differ only in whether the citation is drawn in its style.
	 *
	 * Where the anchor stands against the full stop is the language's
	 * convention, not a setting: Russian sets it before the stop, English
	 * after.
	 */
	const drawFootnote = (mode: PreviewMode, citation: Node): void => {
		const label = footnoteLabel(1, plugin.footnoteOptions());
		const reading = mode === "reading";

		const marker = (parent: HTMLElement, cls: string, close: string): void => {
			const el = parent.createSpan({ cls });
			el.createSpan({ cls: "citation-suite-style-preview-formatting", text: "[^" });
			el.appendText(label);
			el.createSpan({ cls: "citation-suite-style-preview-formatting", text: close });
		};
		const anchor = (parent: HTMLElement): void => {
			if (reading) {
				parent.createEl("sup", {
					cls: "citation-suite-style-preview-anchor",
					text: label,
				});
			} else {
				marker(parent, "citation-suite-style-preview-footref", "]");
			}
		};

		const text = body.createEl("p", { cls: "citation-suite-style-preview-text" });
		text.appendText(t.PREVIEW_SENTENCE);
		if (lang === "ru") {
			anchor(text);
			text.appendText(".");
		} else {
			text.appendText(".");
			anchor(text);
		}

		const footnote = body.createEl("p", {
			cls: reading
				? "citation-suite-style-preview-footnote"
				: "citation-suite-style-preview-footnote-line",
		});
		if (reading) {
			anchor(footnote);
		} else {
			marker(footnote, "citation-suite-style-preview-footnote-label", "]:");
		}
		footnote.appendText(" ");
		footnote.appendChild(citation);
	};

	refresh();

	return {
		refresh,
		destroy: () => {
			generation++;
			save.run();
		},
	};
}

/**
 * The theme's accent colour as `#rrggbb`, which is the only form a colour input
 * takes. The theme states it as a variable, often in `hsl()`; the browser's
 * computed colour of an element set in it is always `rgb()`, and that is read.
 */
function accentHex(parent: HTMLElement): string {
	const probe = parent.createSpan({ cls: "citation-suite-accent-probe" });
	const color = probe.win.getComputedStyle(probe).color;
	probe.remove();
	const match = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);
	if (!match) {
		return FALLBACK_ACCENT;
	}
	return (
		"#" +
		match
			.slice(1, 4)
			.map((channel) => Number(channel).toString(16).padStart(2, "0"))
			.join("")
	);
}
