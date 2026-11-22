// Reusable stateful button component
export class ButtonComponent {
  constructor({
    id,
    label = '',
    value = '',
    ariaLabel,
    ariaPressed = null,
    active = false,
    disabled = false,
    variant = 'default',
    iconSymbolId = null,
    onClick
  } = {}) {
    this.id = id;
    this.label = label;
    this.value = value;
    this.ariaLabel = ariaLabel;
    this.isToggleable = ariaPressed !== null;
    this.active = Boolean(active);
    this.disabled = Boolean(disabled);
    this.variant = variant;
    this.iconSymbolId = iconSymbolId;
    this.onClick = onClick;

    this.button = document.createElement('button');
    this.button.type = 'button';
    if (this.id) this.button.id = this.id;
    if (this.value !== '') this.button.dataset.value = String(this.value);
    if (this.ariaLabel) this.button.setAttribute('aria-label', this.ariaLabel);

    this.render();
    this.attachEvents();
  }

  // Renders button content and syncs modifier classes and ARIA attributes
  render() {
    const iconHtml = this.iconSymbolId
      ? `<svg class="icon icon--sm" aria-hidden="true"><use href="#${this.iconSymbolId}" /></svg>`
      : '';
    this.button.innerHTML = `${iconHtml}<span class="btn-label"></span>`;
    this.button.querySelector('.btn-label').textContent = this.label;
    this.syncClassesAndAttributes();
  }

  // Synchronizes BEM modifier classes and accessibility state
  syncClassesAndAttributes() {
    this.button.classList.add('btn');
    this.button.classList.toggle('btn--segmented', this.variant === 'segmented');
    this.button.classList.toggle('btn--active', this.active);
    this.button.classList.toggle('btn--disabled', this.disabled);
    this.button.disabled = this.disabled;

    if (this.isToggleable) {
      this.button.setAttribute('aria-pressed', String(this.active));
    } else {
      this.button.removeAttribute('aria-pressed');
    }
  }

  // Binds click event listener
  attachEvents() {
    this.button.addEventListener('click', (e) => {
      if (this.disabled) return;
      if (typeof this.onClick === 'function') {
        this.onClick(this.value, e);
      }
    });
  }

  // Updates active visual and ARIA state
  setActive(isActive) {
    this.active = Boolean(isActive);
    this.syncClassesAndAttributes();
  }

  // Updates disabled state
  setDisabled(isDisabled) {
    this.disabled = Boolean(isDisabled);
    this.syncClassesAndAttributes();
  }

  // Updates button label text
  setLabel(label) {
    this.label = label;
    const labelEl = this.button.querySelector('.btn-label');
    if (labelEl) {
      labelEl.textContent = label;
    }
  }

  // Returns button associated value
  getValue() {
    return this.value;
  }

  // Returns root button DOM element
  getElement() {
    return this.button;
  }
}
