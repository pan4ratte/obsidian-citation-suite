import { App, setIcon, setTooltip } from "obsidian";
import { getChangelogContent, getUserGuideContent, t } from "lang/helpers";
import { checkZotero, ZoteroCheck } from "src/cayw";
import { MarkdownModal } from "src/markdownModal";
import { spinner } from "src/spinner";

/**
 * The card at the head of the settings, drawn after the one Pandoc GUI keeps at
 * the head of its own: what the running release brought, until it is dismissed;
 * whether Zotero is there to cite from, with the documents to read beside it;
 * and what is wrong, when something is.
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
	/** The release running now, which is also what dismissing remembers. */
	version: string;
	/** The release whose changelog notice was dismissed. */
	dismissedVersion: string;
	onDismiss(): void;
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
 * A button standing as a panel of the card: an icon and a label. The label is
 * handed back for a button whose label is more than a word.
 */
function actionButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void
): { button: HTMLButtonElement; icon: HTMLElement; label: HTMLElement } {
	const button = parent.createEl("button", { cls: "citation-suite-action" });
	const iconEl = button.createSpan({ cls: "citation-suite-action-icon" });
	setIcon(iconEl, icon);
	const labelEl = button.createSpan({ text: label });
	button.addEventListener("click", onClick);
	return { button, icon: iconEl, label: labelEl };
}

/**
 * What this release brought, as the first row of the card. Dismissing it
 * closes the card up behind the row rather than blinking it out of a gap.
 */
function renderChangelogNotice(
	card: HTMLElement,
	options: StatusCardOptions
): void {
	if (options.dismissedVersion === options.version) {
		return;
	}
	const row = card.createDiv({
		cls: "citation-suite-status-row citation-suite-changelog-notice",
	});
	const text = row.createSpan({ cls: "citation-suite-changelog-notice-text" });
	text.appendText(t.CHANGELOG_BANNER_PREFIX);
	// A button rather than a link: it opens a modal, it does not go anywhere.
	const versionButton = text.createEl("button", {
		cls: "citation-suite-changelog-version",
		text: options.version,
	});
	versionButton.addEventListener("click", () => {
		new MarkdownModal(options.app, getChangelogContent()).open();
	});

	const dismiss = row.createEl("button", {
		cls: "clickable-icon citation-suite-changelog-dismiss",
	});
	setIcon(dismiss, "x");
	setTooltip(dismiss, t.CHANGELOG_BANNER_DISMISS);
	dismiss.addEventListener("click", () => {
		options.onDismiss();
		if (row.win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			row.remove();
			return;
		}
		const animation = row.animate(
			{
				height: [`${row.getBoundingClientRect().height}px`, "0px"],
				opacity: [1, 0],
			},
			{ duration: 180, easing: "ease-in-out" }
		);
		animation.onfinish = () => row.remove();
	});
}

export function renderStatusCard(
	parent: HTMLElement,
	options: StatusCardOptions
): StatusCard {
	const card = parent.createDiv({ cls: "citation-suite-status-panel" });
	renderChangelogNotice(card, options);

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
	actionButton(panels, "scroll-text", t.STATUS_CHANGELOG, () => {
		new MarkdownModal(options.app, getChangelogContent()).open();
	});
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
