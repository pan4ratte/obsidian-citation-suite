import { debounce, setIcon, setTooltip } from "obsidian";
import { t } from "lang/helpers";
import {
	COLOR_ACCENT,
	isAccentColor,
	isCustomColor,
	UNDERLINES,
} from "src/look";
import type ZoterikPlugin from "src/main";
import { citationEl } from "src/reading";
import { sampleSource } from "src/sample";
import { CitationUnderline } from "src/types";

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
 */
export function renderStylePreview(
	parent: HTMLElement,
	plugin: ZoterikPlugin
): StylePreview {
	const settings = plugin.settings;
	const preview = parent.createDiv({ cls: "zoterik-style-preview" });

	const bar = preview.createDiv({ cls: "zoterik-style-preview-bar" });
	bar.createDiv({
		cls: "zoterik-style-preview-title",
		text: t.PREVIEW_TITLE,
	});
	const actions = bar.createDiv({ cls: "zoterik-style-preview-actions" });

	const body = preview.createDiv({ cls: "zoterik-style-preview-body" });

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
			cls: "zoterik-style-preview-group",
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
		cls: "zoterik-style-preview-color-input",
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
	customButton.addClass("zoterik-style-preview-custom");
	// The custom colour itself, as a dot on its button while it is in use.
	customButton.createSpan({ cls: "zoterik-style-preview-swatch" });

	actions.createDiv({ cls: "zoterik-style-preview-separator" });

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

	actions.createDiv({ cls: "zoterik-style-preview-separator" });

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
		const written = settings.brackets
			? `[@${source.citekey}]`
			: `@${source.citekey}`;

		const draw = (citation: HTMLElement): void => {
			if (current !== generation) {
				return;
			}
			body.empty();
			const text = body.createEl("p", { cls: "zoterik-style-preview-text" });
			text.appendText(`${t.PREVIEW_SENTENCE} `);
			text.appendChild(citation);
			// A note style writes the whole footnote, full stop included, and a
			// second one after it would read as a typo.
			if (!/[.!?…]$/.test((citation.textContent ?? "").trim())) {
				text.appendText(".");
			}
		};

		// Not rendered at all, or not renderable: the citation as a note holds
		// it, which is also what a note would show.
		const unstyled = (): HTMLElement =>
			createSpan({ cls: "zoterik-style-preview-source", text: written });

		if (!styleId) {
			draw(unstyled());
			return;
		}
		void plugin.renderer.sample(styleId, source.item).then((rendered) => {
			draw(rendered ? citationEl(rendered, written) : unstyled());
		});
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
	const probe = parent.createSpan({ cls: "zoterik-accent-probe" });
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
