// Stateful custom dropdown select component with mutual exclusion
export class SelectComponent {
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

    // Handles document outside-clicks to close dropdown
    this.handleOutsideClick = (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    };

    this.render();
    this.attachEvents();
  }

  // Updates disabled option (mutual exclusion with partner dropdown)
  setDisabledValue(disabledValue) {
    this.disabledValue = disabledValue;
    this.updateOptionsDOM();
  }

  // Sets active selection value
  setSelectedValue(value) {
    this.selectedValue = value;
    this.updateTriggerDOM();
    this.updateOptionsDOM();
  }

  // Updates items dataset
  setItems(items, selectedValue, disabledValue) {
    this.items = items;
    if (selectedValue !== undefined) this.selectedValue = selectedValue;
    if (disabledValue !== undefined) this.disabledValue = disabledValue;
    this.render();
    this.attachEvents();
  }

  // Renders component markup
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

  // Generates option items markup
  renderOptionsHTML() {
    return this.items.map(item => {
      const isSelected = item.value === this.selectedValue;
      const isDisabled = item.value === this.disabledValue;
      const classes = [
        'custom-select-option',
        isSelected && 'is-selected',
        isDisabled && 'is-disabled'
      ].filter(Boolean).join(' ');

      return `
        <li class="${classes}" data-value="${item.value}" role="option" aria-selected="${isSelected}" aria-disabled="${isDisabled}">
          <span class="option-text">${item.label}</span>
          ${isDisabled ? `<span class="option-badge">${this.disabledBadgeText}</span>` : ''}
        </li>
      `;
    }).join('');
  }

  // Updates trigger label text in DOM
  updateTriggerDOM() {
    const selectedItem = this.items.find(item => item.value === this.selectedValue);
    const labelEl = this.container.querySelector('.custom-select-label-text');
    if (labelEl && selectedItem) {
      labelEl.textContent = selectedItem.label;
    }
  }

  // Refreshes options list in DOM
  updateOptionsDOM() {
    const listEl = this.container.querySelector('.custom-select-options-list');
    if (listEl) {
      listEl.innerHTML = this.renderOptionsHTML();
    }
  }

  // Binds click and selection event listeners
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
        return;
      }

      const valAttr = optionLi.getAttribute('data-value');
      const newValue = isNaN(valAttr) ? valAttr : parseInt(valAttr, 10);
      this.closeDropdown();

      if (newValue !== this.selectedValue) {
        this.selectedValue = newValue;
        this.updateTriggerDOM();
        this.updateOptionsDOM();
        if (typeof this.onChange === 'function') {
          this.onChange(newValue);
        }
      }
    });

    document.removeEventListener('click', this.handleOutsideClick);
    document.addEventListener('click', this.handleOutsideClick);
  }

  // Toggles dropdown menu visibility
  toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
      return;
    }
    this.openDropdown();
  }

  // Opens dropdown menu and closes sibling selects
  openDropdown() {
    document.querySelectorAll('.custom-select-component.is-open').forEach(el => {
      if (el === this.container) return;
      el.classList.remove('is-open');
      el.querySelector('.custom-select-dropdown')?.classList.remove('custom-select-dropdown--open');
      el.querySelector('.custom-select-arrow')?.classList.remove('custom-select-arrow--open');
    });

    this.isOpen = true;
    this.container.classList.add('is-open');
    this.container.querySelector('.custom-select-dropdown')?.classList.add('custom-select-dropdown--open');
    this.container.querySelector('.custom-select-arrow')?.classList.add('custom-select-arrow--open');
    this.container.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'true');
  }

  // Closes dropdown menu
  closeDropdown() {
    this.isOpen = false;
    this.container.classList.remove('is-open');
    this.container.querySelector('.custom-select-dropdown')?.classList.remove('custom-select-dropdown--open');
    this.container.querySelector('.custom-select-arrow')?.classList.remove('custom-select-arrow--open');
    this.container.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
  }

  // Returns root DOM container element
  getElement() {
    return this.container;
  }
}
