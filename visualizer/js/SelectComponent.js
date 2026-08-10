// js/SelectComponent.js

export class SelectComponent {
  /**
   * @param {Object} options
   * @param {string} options.id - Container element ID
   * @param {string} [options.ariaLabel] - ARIA label for accessibility
   * @param {Array<{value: number|string, label: string}>} [options.items] - List of option items
   * @param {number|string} options.selectedValue - Initially selected value
   * @param {number|string|null} [options.disabledValue] - Value that should be unselectable
   * @param {Function} [options.onChange] - Callback fired when selection changes: (newValue) => void
   */
  constructor({ id, ariaLabel = 'Select option', items = [], selectedValue, disabledValue = null, disabledBadgeText = 'active selection', onChange }) {
    this.id = id;
    this.ariaLabel = ariaLabel;
    this.items = items;
    this.selectedValue = selectedValue;
    this.disabledValue = disabledValue;
    this.disabledBadgeText = disabledBadgeText;
    this.onChange = onChange;
    this.isOpen = false;

    this.container = document.createElement('div');
    this.container.className = 'custom-select-component';
    if (this.id) this.container.id = this.id;

    this.handleOutsideClick = (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    };

    this.render();
    this.attachEvents();
  }

  setDisabledValue(disabledValue) {
    this.disabledValue = disabledValue;
    this.updateOptionsDOM();
  }

  setSelectedValue(value) {
    this.selectedValue = value;
    this.updateTriggerDOM();
    this.updateOptionsDOM();
  }

  setItems(items, selectedValue, disabledValue) {
    this.items = items;
    if (selectedValue !== undefined) this.selectedValue = selectedValue;
    if (disabledValue !== undefined) this.disabledValue = disabledValue;
    this.render();
    this.attachEvents();
  }

  render() {
    const selectedItem = this.items.find(item => item.value === this.selectedValue) || this.items[0];
    const selectedText = selectedItem ? selectedItem.label : 'Select snapshot...';

    this.container.innerHTML = `
      <button type="button" class="custom-select-trigger" aria-label="${this.ariaLabel}" aria-haspopup="listbox" aria-expanded="false">
        <span class="custom-select-label-text">${selectedText}</span>
        <span class="custom-select-arrow" aria-hidden="true">⯆</span>
      </button>
      <div class="custom-select-dropdown" role="listbox">
        <ul class="custom-select-options-list">
          ${this.renderOptionsHTML()}
        </ul>
      </div>
    `;
  }

  renderOptionsHTML() {
    return this.items.map(item => {
      const isSelected = item.value === this.selectedValue;
      const isDisabled = item.value === this.disabledValue;
      let classes = 'custom-select-option';
      if (isSelected) classes += ' is-selected';
      if (isDisabled) classes += ' is-disabled';

      return `
        <li class="${classes}" data-value="${item.value}" role="option" aria-selected="${isSelected}" aria-disabled="${isDisabled}">
          <span class="option-text">${item.label}</span>
          ${isDisabled ? `<span class="option-badge">${this.disabledBadgeText}</span>` : ''}
        </li>
      `;
    }).join('');
  }

  updateTriggerDOM() {
    const selectedItem = this.items.find(item => item.value === this.selectedValue);
    const labelEl = this.container.querySelector('.custom-select-label-text');
    if (labelEl && selectedItem) {
      labelEl.textContent = selectedItem.label;
    }
  }

  updateOptionsDOM() {
    const listEl = this.container.querySelector('.custom-select-options-list');
    if (listEl) {
      listEl.innerHTML = this.renderOptionsHTML();
    }
  }

  attachEvents() {
    const trigger = this.container.querySelector('.custom-select-trigger');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    const optionsList = this.container.querySelector('.custom-select-options-list');
    optionsList.addEventListener('click', (e) => {
      const optionLi = e.target.closest('.custom-select-option');
      if (!optionLi) return;

      if (optionLi.classList.contains('is-disabled')) {
        e.stopPropagation();
        return; // Cannot select snapshot disabled by secondary select
      }

      const valAttr = optionLi.getAttribute('data-value');
      const newValue = isNaN(valAttr) ? valAttr : parseInt(valAttr, 10);

      if (newValue !== this.selectedValue) {
        this.selectedValue = newValue;
        this.updateTriggerDOM();
        this.updateOptionsDOM();
        this.closeDropdown();
        if (typeof this.onChange === 'function') {
          this.onChange(newValue);
        }
      } else {
        this.closeDropdown();
      }
    });

    // Close when clicking outside
    document.removeEventListener('click', this.handleOutsideClick);
    document.addEventListener('click', this.handleOutsideClick);
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      // Close all other dropdowns
      document.querySelectorAll('.custom-select-component.is-open').forEach(el => {
        if (el !== this.container) {
          el.classList.remove('is-open');
          const d = el.querySelector('.custom-select-dropdown');
          const a = el.querySelector('.custom-select-arrow');
          if (d) d.classList.remove('custom-select-dropdown--open');
          if (a) a.classList.remove('custom-select-arrow--open');
        }
      });
      this.isOpen = true;
      this.container.classList.add('is-open');
      const dropdown = this.container.querySelector('.custom-select-dropdown');
      const arrow = this.container.querySelector('.custom-select-arrow');
      if (dropdown) dropdown.classList.add('custom-select-dropdown--open');
      if (arrow) arrow.classList.add('custom-select-arrow--open');
      const trigger = this.container.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }
  }

  closeDropdown() {
    this.isOpen = false;
    this.container.classList.remove('is-open');
    const dropdown = this.container.querySelector('.custom-select-dropdown');
    const arrow = this.container.querySelector('.custom-select-arrow');
    if (dropdown) dropdown.classList.remove('custom-select-dropdown--open');
    if (arrow) arrow.classList.remove('custom-select-arrow--open');
    const trigger = this.container.querySelector('.custom-select-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  getElement() {
    return this.container;
  }
}
