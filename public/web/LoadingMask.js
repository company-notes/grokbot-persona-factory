/**
 * One reusable indeterminate progress surface for long-running AI requests.
 * The HTTP API is not streaming; do not claim to know which server-side phase
 * is currently running or show fabricated percent-complete progress.
 */
export class LoadingMask {
  constructor(i18n) {
    this.i18n = i18n;
    this.root = document.getElementById("loadingOverlay");
    this.title = document.getElementById("loadingTitle");
    this.description = document.getElementById("loadingDescription");
    this.elapsed = document.getElementById("loadingElapsed");
    this.timer = null;
    this.previousFocus = null;
  }

  get active() { return !this.root.hidden; }

  show(mode, includeAvatar = false) {
    if (this.active) return;
    this.previousFocus = document.activeElement;
    this.title.textContent = this.i18n.text(mode === "refine" ? "loading.refineTitle" : "loading.draftTitle");
    this.description.textContent = this.i18n.text(includeAvatar ? "loading.avatarDescription" : "loading.textDescription");
    this.root.hidden = false;
    document.body.classList.add("is-generating");
    const started = Date.now();
    const update = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      this.elapsed.textContent = this.i18n.text("loading.elapsed").replace("{seconds}", String(seconds));
    };
    update();
    this.timer = window.setInterval(update, 1000);
    this.root.focus();
  }

  hide() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.root.hidden = true;
    document.body.classList.remove("is-generating");
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
}
