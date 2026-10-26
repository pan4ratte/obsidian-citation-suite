import { App, ButtonComponent, ExtraButtonComponent, setIcon, setTooltip } from "obsidian";
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
 * A notice or a warning to draw: what it says, and what can be done with it.
 * `key` tells a card already drawn from a new one, so that a check giving the
 * same answer leaves it standing.
 */
interface Callout {
	key: string;
	kind: "info" | "warning";
	title: string;
	text: string;
	/** A page the card's button opens. */
	link?: string;
	/** Closes the card for good, from a cross at its end. */
	dismiss?: () => void;
}

/** Resolves once the card's animations have finished, at once when it has none. */
async function animationsDone(card: HTMLElement): Promise<void> {
	await Promise.all(
		card.getAnimations().map((animation) => animation.finished.catch(() => undefined))
	);
}

/**
 * Animates a card just drawn open from nothing. styles.css animates the height
 * up to what it is now, which only the element can say, so it is measured
 * here. Under reduced motion there is no animation.
 */
function expand(card: HTMLElement): void {
	card.setCssProps({ "--citation-suite-callout-height": `${card.offsetHeight}px` });
	card.addClass("is-opening");
	void animationsDone(card).then(() => card.removeClass("is-opening"));
}

/**
 * Collapses a card and takes it out: the same measure, the other way. Under
 * reduced motion there is nothing to wait for, and the card goes at once.
 */
async function collapse(card: HTMLElement): Promise<void> {
	card.setCssProps({ "--citation-suite-callout-height": `${card.offsetHeight}px` });
	card.inert = true;
	card.removeClass("is-opening");
	card.addClass("is-closing");
	await animationsDone(card);
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

	/** Zotero's state, coloured by what it says. */
	const drawLine = (state: "ok" | "absent" | "checking", text: string): void => {
		line.className = `citation-suite-status-pill is-${state}`;
		line.setText(text);
	};

	/**
	 * A card with an icon in a round badge beside a title saying what, over the
	 * text saying why and what to do, the text muted. A notice is a state of
	 * Zotero's, in the info colour, and goes when the state does; a warning is
	 * something that will go wrong unless the reader acts, in the warning
	 * colour, with a cross at the end that closes it for good.
	 */
	const drawCallout = (container: HTMLElement, callout: Callout): HTMLElement => {
		const calloutCard = container.createDiv({
			cls: `citation-suite-status-panel citation-suite-status-${callout.kind}`,
		});
		calloutCard.dataset.callout = callout.key;
		const row = calloutCard.createDiv({
			cls: "citation-suite-status-row citation-suite-status-notice",
		});
		setIcon(
			row.createSpan({ cls: "citation-suite-status-notice-icon" }),
			callout.kind === "info" ? "info" : "triangle-alert"
		);
		const body = row.createDiv({ cls: "citation-suite-status-notice-body" });
		body.createDiv({ cls: "citation-suite-status-notice-title", text: callout.title });
		body.createDiv({ text: callout.text });
		// What to do about it, as a button at the end of the card.
		const link = callout.link;
		if (link) {
			new ButtonComponent(row)
				.setButtonText(t.STATUS_BETTER_BIBTEX_INSTALL)
				.onClick(() => window.open(link))
				.buttonEl.addClass("citation-suite-status-notice-action");
		}
		const dismiss = callout.dismiss;
		if (dismiss) {
			new ExtraButtonComponent(row)
				.setIcon("x")
				.setTooltip(t.STATUS_DISMISS)
				.onClick(() => {
					dismiss();
					void collapse(calloutCard);
				})
				.extraSettingsEl.addClass("citation-suite-status-notice-close");
		}
		return calloutCard;
	};

	/**
	 * Brings a container's cards in line with what should be said: a card
	 * still wanted stays as it is, one no longer wanted collapses, and a new
	 * one opens. Drawn with the tab, the cards are simply there.
	 */
	const sync = (container: HTMLElement, callouts: Callout[], animate: boolean): void => {
		const wanted = new Set(callouts.map((callout) => callout.key));
		const standing = new Set<string>();
		for (const child of Array.from(container.children)) {
			if (!child.instanceOf(HTMLElement) || child.hasClass("is-closing")) {
				continue;
			}
			const key = child.dataset.callout ?? "";
			if (wanted.has(key)) {
				standing.add(key);
			} else if (animate) {
				void collapse(child);
			} else {
				child.remove();
			}
		}
		for (const callout of callouts) {
			if (!standing.has(callout.key)) {
				const calloutCard = drawCallout(container, callout);
				if (animate) {
					expand(calloutCard);
				}
			}
		}
	};

	const draw = (check: StatusCheck, animate: boolean): void => {
		const noticeCallouts: Callout[] = [];
		if (!check.running) {
			drawLine("absent", t.STATUS_ZOTERO_NOT_RUNNING);
		} else {
			drawLine("ok", t.STATUS_ZOTERO_RUNNING);
			if (check.betterBibTeX === "missing") {
				noticeCallouts.push({
					key: "better-bibtex-missing",
					kind: "info",
					title: t.STATUS_BETTER_BIBTEX_MISSING_TITLE,
					text: t.STATUS_BETTER_BIBTEX_MISSING,
					link: BETTER_BIBTEX_INSTALL_URL,
				});
			} else if (check.betterBibTeX === "starting") {
				noticeCallouts.push({
					key: "better-bibtex-starting",
					kind: "info",
					title: t.STATUS_BETTER_BIBTEX_STARTING_TITLE,
					text: t.STATUS_BETTER_BIBTEX_STARTING,
				});
			}
		}
		const warningCallouts: Callout[] = [];
		// Read off the disk, so it holds with Zotero closed too — and costs a
		// citation the next time a source is edited, which is when a warning
		// is still of use. A Zotero without Better BibTeX has no keys to lose.
		if (
			check.regeneratesKeys &&
			check.betterBibTeX !== "missing" &&
			!options.keysWarningDismissed()
		) {
			warningCallouts.push({
				key: "keys-regenerated",
				kind: "warning",
				title: t.STATUS_KEYS_REGENERATED_TITLE,
				text: t.STATUS_KEYS_REGENERATED,
				dismiss: () => options.dismissKeysWarning(),
			});
		}
		sync(notices, noticeCallouts, animate);
		sync(warnings, warningCallouts, animate);
	};

	const refresh = (): void => {
		const current = ++generation;
		// The cards stand while Zotero is asked, and change only with its answer.
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
			draw(check, true);
			spin.stop();
		});
	};

	if (options.lastCheck) {
		draw(options.lastCheck, false);
	} else {
		refresh();
	}
	return { refresh };
}
