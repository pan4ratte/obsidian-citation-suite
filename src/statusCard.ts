import { App, setIcon, setTooltip } from "obsidian";
import { getUserGuideContent, t } from "lang/helpers";
import { checkZotero, ZoteroCheck } from "src/cayw";
import { MarkdownModal } from "src/markdownModal";
import { spinner } from "src/spinner";

/**
 * The card at the head of the settings, drawn after the one Pandoc GUI keeps at
 * the head of its own: whether Zotero is there to cite from, with the documents
 * to read beside it — the changelog announcing a release not yet read — and
 * what is wrong, when something is.
 *
 * Each of those is a row of one card, divided by a rule. The status row is
 * panels divided by upright rules: Zotero's status — one line saying whether it
 * answers, which checks again when pressed — and to the right of it the
 * changelog and the user guide. Better
 * BibTeX has no panel of its own: it is only ever worth a line when it is
 * missing, and then that line is a notice across the whole card.
 */

/** Where Better BibTeX's installation is explained, for the notice to link to. */
const BETTER_BIBTEX_INSTALL_URL =
	"https://retorque.re/zotero-better-bibtex/installation/";

export interface StatusCardOptions {
	app: App;
	/** Whether the running release's changelog has been opened. */
	changelogRead: boolean;
	/** Opens the changelog, and marks it read. */
	openChangelog(): void;
	/** The port the settings point at, read again on every check. */
	port(): number;
	/**
	 * The last check, to draw without asking Zotero again when the card is
	 * drawn anew within one opening of the tab.
	 */
	lastCheck: ZoteroCheck | null;
	onChecked(check: ZoteroCheck): void;
}

export interface StatusCard {
	/** Asks Zotero again, and redraws the status and the notice. */
	refresh(): void;
}

/**
 * A button standing as a panel of the card: an icon and a label. The icon is
 * Obsidian's by name, or drawn into its place. The label is handed back for a
 * button whose label is more than a word.
 */
function actionButton(
	parent: HTMLElement,
	icon: string | ((el: HTMLElement) => void),
	label: string,
	onClick: () => void
): { button: HTMLButtonElement; icon: HTMLElement; label: HTMLElement } {
	const button = parent.createEl("button", { cls: "citation-suite-action" });
	const iconEl = button.createSpan({ cls: "citation-suite-action-icon" });
	if (typeof icon === "string") {
		setIcon(iconEl, icon);
	} else {
		icon(iconEl);
	}
	const labelEl = button.createSpan({ text: label });
	button.addEventListener("click", onClick);
	return { button, icon: iconEl, label: labelEl };
}

/** Animate UI's sparkles: the star. */
const SPARKLES_STAR =
	"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z";

/**
 * The changelog's icon: Animate UI's sparkles (`@animate-ui/icons-sparkles`),
 * Lucide's star with a plus and a dot, drawn here as that icon draws it. The
 * original is a React component animated by Motion, which the plugin has
 * neither of, so the plus and the dot carry a class and styles.css loops the
 * icon's `default` animation on them, the star held still: the plus and the
 * dot wink out and back. Drawn only while the release's changelog is unread.
 */
function sparklesIcon(parent: HTMLElement): void {
	const svg = parent.createSvg("svg", {
		// An array, not a space-separated string, whatever the typings say:
		// Obsidian's `createSvg` hands `cls` to `classList.add()` as it is,
		// which throws on a space (read out of 1.13.7's `enhance.js`).
		cls: ["svg-icon", "citation-suite-sparkles"],
		attr: {
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	svg.createSvg("path", { attr: { d: SPARKLES_STAR } });
	svg.createSvg("path", {
		cls: "citation-suite-sparkles-plus",
		attr: { d: "M20 2v4 M22 4h-4" },
	});
	svg.createSvg("circle", {
		cls: "citation-suite-sparkles-dot",
		attr: { cx: "4", cy: "20", r: "2" },
	});
}

export function renderStatusCard(
	parent: HTMLElement,
	options: StatusCardOptions
): StatusCard {
	const card = parent.createDiv({ cls: "citation-suite-status-panel" });

	const panels = card.createDiv({
		cls: "citation-suite-status-row citation-suite-status-panels",
	});
	// The status is a panel like the documents beside it, and pressing it asks
	// Zotero again. Its label is the name and what Zotero said, one run of
	// text a word space apart, so that they read as one line.
	const status = actionButton(panels, "refresh-cw", "", () => refresh());
	status.label.createSpan({
		cls: "citation-suite-status-name",
		text: t.STATUS_TITLE,
	});
	status.label.appendText(" ");
	const line = status.label.createSpan({ cls: "citation-suite-status-line" });
	setTooltip(status.button, t.STATUS_RECHECK);
	const spin = spinner(status.icon);
	// A release whose changelog is unread is announced by the panel itself:
	// in the accent, with looping sparkles. Once read, the scroll every other
	// document panel would have.
	const changelog = actionButton(
		panels,
		options.changelogRead ? "scroll-text" : sparklesIcon,
		t.STATUS_CHANGELOG,
		() => {
			options.openChangelog();
			changelog.button.removeClass("is-unread");
			changelog.icon.empty();
			setIcon(changelog.icon, "scroll-text");
		}
	);
	changelog.button.toggleClass("is-unread", !options.changelogRead);
	actionButton(panels, "book-open", t.STATUS_USER_GUIDE, () => {
		new MarkdownModal(options.app, getUserGuideContent()).open();
	});
	// Under the status, filled only when there is something to say at length.
	const notices = card.createDiv({ cls: "citation-suite-status-notices" });

	/** A check whose answer is still out when another starts is not drawn. */
	let generation = 0;

	const drawLine = (state: string, text: string): void => {
		line.className = `citation-suite-status-line is-${state}`;
		line.setText(text);
	};

	const drawNotice = (text: string, link?: string): void => {
		const notice = notices.createDiv({
			cls: "citation-suite-status-row citation-suite-status-notice",
		});
		// The text and its link in one span, so that the row can centre them
		// as one line of words; laid out on their own, the space between them
		// would be dropped.
		const line = notice.createSpan();
		line.appendText(text);
		if (link) {
			line.appendText(" ");
			line.createEl("a", {
				text: t.STATUS_BETTER_BIBTEX_INSTALL,
				href: link,
			});
		}
	};

	const draw = (check: ZoteroCheck): void => {
		notices.empty();
		if (!check.running) {
			drawLine("absent", t.STATUS_ZOTERO_NOT_RUNNING);
			return;
		}
		drawLine("ok", t.STATUS_ZOTERO_RUNNING);
		if (check.betterBibTeX === "missing") {
			drawNotice(t.STATUS_BETTER_BIBTEX_MISSING, BETTER_BIBTEX_INSTALL_URL);
		} else if (check.betterBibTeX === "starting") {
			drawNotice(t.NOTICE_ZOTERO_STARTING);
		}
	};

	const refresh = (): void => {
		const current = ++generation;
		notices.empty();
		drawLine("checking", t.STATUS_CHECKING);
		spin.start();
		void checkZotero(options.port()).then((check) => {
			if (current !== generation || !card.isConnected) {
				return;
			}
			options.onChecked(check);
			draw(check);
			spin.stop();
		});
	};

	if (options.lastCheck) {
		draw(options.lastCheck);
	} else {
		refresh();
	}
	return { refresh };
}
