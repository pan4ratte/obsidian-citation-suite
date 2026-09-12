import { App, Component, MarkdownRenderer, Modal } from "obsidian";

/**
 * The changelog, rendered as the markdown it is written in. The text arrives
 * already picked for the interface language — `getChangelogContent()` in
 * `lang/helpers.ts` — so the modal itself knows nothing about locales.
 *
 * `MarkdownRenderer.render` wants a component to hang the renderer's own
 * children off, and the modal is not one: a `Component` of its own is loaded
 * for the life of the modal and unloaded with it, or the internal links and
 * embeds it registers outlive the window they were drawn in.
 */
export class ChangelogModal extends Modal {
	private readonly content: string;
	private readonly renderComponent = new Component();

	constructor(app: App, content: string) {
		super(app);
		this.content = content;
	}

	onOpen(): void {
		const { contentEl } = this;
		// The one class, and deliberately not Obsidian's `markdown-rendered`
		// beside it: that one sizes rendered markdown for reading a note, and
		// styles.css sizes this window against plain rendered markdown, the
		// way the sibling Classy PDF Extractor and Publish to Telegram plugins
		// do. Adding the class back silently overrides every size there.
		contentEl.addClass("zoterik-changelog-modal");
		this.renderComponent.load();
		// No source path: nothing in the changelog resolves against a note of
		// the vault, and an empty one is what Obsidian's own docs modals pass.
		void MarkdownRenderer.render(
			this.app,
			this.content,
			contentEl,
			"",
			this.renderComponent
		);
	}

	onClose(): void {
		this.renderComponent.unload();
		this.contentEl.empty();
	}
}
