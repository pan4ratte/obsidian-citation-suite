import { App, ExtraButtonComponent, setIcon, setTooltip } from "obsidian";
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
 * Each of those is a card of its own, a gap apart. The first row is three
 * cards side by side: Zotero's status — one line saying whether it answers,
 * which checks again when pressed — and to the right of it the changelog and
 * the user guide. Better BibTeX has no card of its own: it is only ever worth
 * a line when it is missing, and then that line is a notice across the whole
 * width, under the three.
 */

/** Where Better BibTeX's installation is explained, for the notice to link to. */
const BETTER_BIBTEX_INSTALL_URL =
	"https://retorque.re/zotero-better-bibtex/installation/";

/** What the card was last told: Zotero's answer, and what its preferences say. */
export interface StatusCheck extends ZoteroCheck {
	/**
	 * Whether Better BibTeX remakes a citation key whenever its source is
	 * edited, which loses the source to every note citing the old key.
	 */
	regeneratesKeys: boolean;
}

export interface StatusCardOptions {
	app: App;
	/** The running release's version, shown under the changelog's title. */
	version: string;
	/** Whether the running release's changelog has been opened. */
	changelogRead: boolean;
	/** Opens the changelog, and marks it read. */
	openChangelog(): void;
	/** The port the settings point at, read again on every check. */
	port(): number;
	/** Reads Better BibTeX's key preference off Zotero's disk, on every check. */
	regeneratesKeys(): Promise<boolean>;
	/** Whether the reader closed the warning about it, which is then never drawn. */
	keysWarningDismissed(): boolean;
	/** Closes that warning for good. */
	dismissKeysWarning(): void;
	/**
	 * The last check, to draw without asking Zotero again when the card is
	 * drawn anew within one opening of the tab.
	 */
	lastCheck: StatusCheck | null;
	onChecked(check: StatusCheck): void;
}

export interface StatusCard {
	/** Asks Zotero again, and redraws the status and the notice. */
	refresh(): void;
}

/**
 * A button standing as a card of its own: an icon in a tinted badge at the
 * start, and beside it a title, over a line when there is one to give — Zotero's
 * state, the release's version. The icon is Obsidian's by name, or drawn into
 * its place. The icon and the line are handed back: the status turns the one
 * and writes Zotero's state in the other.
 */
function actionButton(
	parent: HTMLElement,
	icon: string | ((el: HTMLElement) => void),
	title: string,
	description: string | null,
	onClick: () => void
): { button: HTMLButtonElement; icon: HTMLElement; description: HTMLElement | null } {
	const button = parent.createEl("button", { cls: "citation-suite-action" });
	// The icon has a span of its own inside the badge, so that the status
	// turns the icon and not the badge around it.
	const badge = button.createSpan({ cls: "citation-suite-action-badge" });
	const iconEl = badge.createSpan({ cls: "citation-suite-action-icon" });
	if (typeof icon === "string") {
		setIcon(iconEl, icon);
	} else {
		icon(iconEl);
	}
	const text = button.createSpan({ cls: "citation-suite-action-text" });
	text.createSpan({ cls: "citation-suite-action-title", text: title });
	const descriptionEl =
		description === null
			? null
			: text.createSpan({
					cls: "citation-suite-action-description",
					text: description,
				});
	button.addEventListener("click", onClick);
	return { button, icon: iconEl, description: descriptionEl };
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

/**
 * Collapses a closed warning's card and takes it out. styles.css animates the
 * height down from what it is now, which only the element can say, so it is
 * measured here. Under reduced motion there is no animation, nothing to wait
 * for, and the card goes at once.
 */
async function collapse(card: HTMLElement): Promise<void> {
	card.setCssProps({ "--citation-suite-warning-height": `${card.offsetHeight}px` });
	card.inert = true;
	card.addClass("is-closing");
	await Promise.all(
		card.getAnimations().map((animation) => animation.finished.catch(() => undefined))
	);
	card.remove();
}

export function renderStatusCard(
	parent: HTMLElement,
	options: StatusCardOptions
): StatusCard {
	const card = parent.createDiv({ cls: "citation-suite-status-card" });

	const panels = card.createDiv({
		cls: "citation-suite-status-row citation-suite-status-panels",
	});
	// The status is a card like the documents beside it, and pressing it asks
	// Zotero again. The line under its title is what Zotero said.
	const status = actionButton(panels, "refresh-cw", t.STATUS_TITLE, "", () =>
		refresh()
	);
	const line = status.description!;
	setTooltip(status.button, t.STATUS_RECHECK);
	const spin = spinner(status.icon);
	// A release whose changelog is unread is announced by the panel itself:
	// in the accent, with looping sparkles. Once read, the scroll every other
	// document panel would have.
	const changelog = actionButton(
		panels,
		options.changelogRead ? "scroll-text" : sparklesIcon,
		t.STATUS_CHANGELOG,
		`${t.STATUS_VERSION} ${options.version}`,
		() => {
			options.openChangelog();
			changelog.button.removeClass("is-unread");
			changelog.icon.empty();
			setIcon(changelog.icon, "scroll-text");
		}
	);
	changelog.button.toggleClass("is-unread", !options.changelogRead);
	actionButton(panels, "book-open", t.STATUS_USER_GUIDE, null, () => {
		new MarkdownModal(options.app, getUserGuideContent()).open();
	});
	// Under the status, filled only when there is something to say at length.
	const notices = card.createDiv({ cls: "citation-suite-status-notices" });
	// Under the card, a card to each warning: something that will go wrong
	// unless the reader acts, rather than a state of Zotero's.
	const warnings = parent.createDiv({ cls: "citation-suite-status-warnings" });

	/** A check whose answer is still out when another starts is not drawn. */
	let generation = 0;

	/** Zotero's state as a pill, tinted by what it says. */
	const drawLine = (state: "ok" | "absent" | "checking", text: string): void => {
		line.className = `citation-suite-status-pill is-${state}`;
		line.setText(text);
	};

	const drawNotice = (text: string, link?: string): void => {
		const notice = notices.createDiv({
			cls: "citation-suite-status-panel citation-suite-status-row citation-suite-status-notice",
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

	/**
	 * A notice of something that will go wrong unless the reader acts: a
	 * warning sign beside a title saying what, over the text saying why and
	 * what to do. The sign and the title are in the warning colour, the text
	 * muted as every notice's is. A cross at the end closes it for good. It is
	 * a card of its own, under the status card, drawn as that card is.
	 */
	const drawWarning = (title: string, text: string, dismiss: () => void): void => {
		const warningCard = warnings.createDiv({
			cls: "citation-suite-status-panel citation-suite-status-warning",
		});
		const notice = warningCard.createDiv({
			cls: "citation-suite-status-row citation-suite-status-notice is-warning",
		});
		setIcon(
			notice.createSpan({ cls: "citation-suite-status-notice-icon" }),
			"triangle-alert"
		);
		const body = notice.createDiv({ cls: "citation-suite-status-notice-body" });
		body.createDiv({ cls: "citation-suite-status-notice-title", text: title });
		body.createDiv({ text });
		new ExtraButtonComponent(notice)
			.setIcon("x")
			.setTooltip(t.STATUS_DISMISS)
			.onClick(() => {
				dismiss();
				void collapse(warningCard);
			})
			.extraSettingsEl.addClass("citation-suite-status-notice-close");
	};

	const draw = (check: StatusCheck): void => {
		notices.empty();
		warnings.empty();
		if (!check.running) {
			drawLine("absent", t.STATUS_ZOTERO_NOT_RUNNING);
		} else {
			drawLine("ok", t.STATUS_ZOTERO_RUNNING);
			if (check.betterBibTeX === "missing") {
				drawNotice(t.STATUS_BETTER_BIBTEX_MISSING, BETTER_BIBTEX_INSTALL_URL);
			} else if (check.betterBibTeX === "starting") {
				drawNotice(t.NOTICE_ZOTERO_STARTING);
			}
		}
		// Read off the disk, so it holds with Zotero closed too — and costs a
		// citation the next time a source is edited, which is when a warning
		// is still of use. A Zotero without Better BibTeX has no keys to lose.
		if (
			check.regeneratesKeys &&
			check.betterBibTeX !== "missing" &&
			!options.keysWarningDismissed()
		) {
			drawWarning(
				t.STATUS_KEYS_REGENERATED_TITLE,
				t.STATUS_KEYS_REGENERATED,
				() => options.dismissKeysWarning()
			);
		}
	};

	const refresh = (): void => {
		const current = ++generation;
		notices.empty();
		drawLine("checking", t.STATUS_CHECKING);
		spin.start();
		void Promise.all([
			checkZotero(options.port()),
			options.regeneratesKeys(),
		]).then(([zotero, regeneratesKeys]) => {
			if (current !== generation || !card.isConnected) {
				return;
			}
			const check = { ...zotero, regeneratesKeys };
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
