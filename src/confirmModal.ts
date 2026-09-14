import { App, ButtonComponent, Modal } from "obsidian";
import { t } from "lang/helpers";

/** What a confirmation asks, and what is done once it is given. */
export interface Confirmation {
	title: string;
	/** Each a paragraph of its own. */
	paragraphs: string[];
	/** The label of the button that does it. */
	confirm: string;
	onConfirm: () => void | Promise<void>;
}

/**
 * A question asked before something that cannot be taken back, laid out as
 * Obsidian's own deletion dialog is: the paragraphs, then the button that does
 * it in the warning colour and a cancel beside it. Obsidian exports no such
 * dialog, so the plugin draws its own. Closing it any other way cancels.
 */
export class ConfirmModal extends Modal {
	private readonly confirmation: Confirmation;

	constructor(app: App, confirmation: Confirmation) {
		super(app);
		this.confirmation = confirmation;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(this.confirmation.title);
		for (const text of this.confirmation.paragraphs) {
			contentEl.createEl("p", { text });
		}
		const buttons = contentEl.createDiv("modal-button-container");
		new ButtonComponent(buttons)
			.setButtonText(this.confirmation.confirm)
			.setDestructive()
			.onClick(() => {
				this.close();
				void this.confirmation.onConfirm();
			});
		// The safe answer is the one the focus starts on, so Enter does not
		// do what cannot be undone.
		new ButtonComponent(buttons)
			.setButtonText(t.CONFIRM_CANCEL)
			.onClick(() => this.close())
			.buttonEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
