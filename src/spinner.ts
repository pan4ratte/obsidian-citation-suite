/**
 * An icon that turns while Zotero is asked, and slows to a stop once it has
 * answered: the status panel's in the settings, and the bibliography pane's
 * refresh button.
 */

/** The class that turns an icon, as styles.css spins it. */
const SPIN_CLASS = "citation-suite-spinning";

/** One turn of the icon, as styles.css spins it. */
const SPIN_TURN_MS = 800;

/**
 * The least the icon turns while slowing down, in degrees. Less of the turn
 * left than this, and it goes round once more.
 */
const SPIN_MIN_SETTLE_DEG = 120;

/**
 * How the icon slows down: leaving at one and a half times the curve's average
 * speed, and ending at none.
 */
const SETTLE_EASING = "cubic-bezier(0.3, 0.45, 0.55, 1)";
const SETTLE_START_SLOPE = 1.5;

export interface Spinner {
	/** Sets the icon turning, from upright, even while it slows down. */
	start(): void;
	/** Slows the icon to a stop. */
	stop(): void;
}

export function spinner(icon: HTMLElement): Spinner {
	/** The icon slowing to a stop, while it does. */
	let settling: Animation | null = null;

	const start = (): void => {
		settling?.cancel();
		settling = null;
		icon.addClass(SPIN_CLASS);
	};

	/**
	 * Stops the icon turning: it slows down from the speed it turns at and
	 * comes to rest upright, never partway round. It starts slowing where the
	 * turn has got to, so nothing jumps, and goes on for more than the rest of
	 * the turn when little of it is left, so the slowing can be seen. With no
	 * animation running, as for a reader who asked for less motion, it stops
	 * at once.
	 */
	const stop = (): void => {
		// Told apart by what it has rather than by its class, which is another
		// window's own for an icon in a pane popped out of the main one.
		const spin = icon
			.getAnimations()
			.find((animation) => "animationName" in animation);
		const time = Number(spin?.currentTime ?? Number.NaN);
		if (!spin || Number.isNaN(time)) {
			icon.removeClass(SPIN_CLASS);
			return;
		}
		const angle = (360 * (time % SPIN_TURN_MS)) / SPIN_TURN_MS;
		const left = 360 - angle;
		const distance = left < SPIN_MIN_SETTLE_DEG ? left + 360 : left;
		settling = icon.animate(
			[
				{ transform: `rotate(${angle}deg)` },
				{ transform: `rotate(${angle + distance}deg)` },
			],
			{
				// The curve leaves at SETTLE_START_SLOPE times its average
				// speed, which the duration sets to the speed of the spin.
				duration: (SETTLE_START_SLOPE * distance * SPIN_TURN_MS) / 360,
				easing: SETTLE_EASING,
			}
		);
		icon.removeClass(SPIN_CLASS);
		const finished = settling;
		void finished.finished
			.catch(() => undefined)
			.then(() => {
				if (settling === finished) {
					settling = null;
				}
			});
	};

	return { start, stop };
}
