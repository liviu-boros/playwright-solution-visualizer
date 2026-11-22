import { ButtonComponent } from './ButtonComponent.js';

// Stateful segmented button toggle component composed of ButtonComponent instances
export class ButtonToggleComponent {
  constructor({
    id,
    ariaLabel = 'Toggle option',
    options = [],
    selectedValue,
    onChange
  } = {}) {
    this.id = id;
    this.ariaLabel = ariaLabel;
    this.options = options;
    this.selectedValue = selectedValue !== undefined ? selectedValue : options[0]?.value;
    this.onChange = onChange;
    this.buttons = new Map();

    this.container = document.createElement('div');
    this.container.className = 'button-toggle';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', this.ariaLabel);
    if (this.id) this.container.id = this.id;

    this.render();
  }

  // Renders child ButtonComponent instances into the toggle group
  render() {
    this.container.innerHTML = '';
    this.buttons.clear();

    for (const option of this.options) {
      const isActive = option.value === this.selectedValue;
      const btn = new ButtonComponent({
        id: option.id,
        label: option.label,
        value: option.value,
        ariaLabel: option.ariaLabel,
        ariaPressed: isActive,
        active: isActive,
        disabled: Boolean(option.disabled),
        variant: 'segmented',
        iconSymbolId: option.iconSymbolId || null,
        onClick: (val) => this.select(val)
      });

      this.buttons.set(option.value, btn);
      this.container.appendChild(btn.getElement());
    }
  }

  // Selects an option, updates active states, and emits onChange if value changed
  select(value) {
    const targetButton = this.buttons.get(value);
    if (!targetButton || targetButton.disabled || value === this.selectedValue) {
      return;
    }

    this.selectedValue = value;
    this.syncActiveStates();

    if (typeof this.onChange === 'function') {
      this.onChange(value);
    }
  }

  // Programmatically sets selected value without emitting onChange
  setSelectedValue(value) {
    if (!this.buttons.has(value)) return;
    this.selectedValue = value;
    this.syncActiveStates();
  }

  // Updates active state on all child ButtonComponent instances
  syncActiveStates() {
    for (const [val, btn] of this.buttons.entries()) {
      btn.setActive(val === this.selectedValue);
    }
  }

  // Returns currently active option value
  getSelectedValue() {
    return this.selectedValue;
  }

  // Returns child ButtonComponent map
  getButtons() {
    return this.buttons;
  }

  // Returns root DOM container element
  getElement() {
    return this.container;
  }
}
