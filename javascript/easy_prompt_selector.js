// === EasyPromptSelector.js (完整修正 + Undo/Redo/Restore Working) ===

class EPSElementBuilder {
  static baseButton(text, { size = 'lg', color = 'primary', onClick = null, id = '' } = {}) {
    const button = gradioApp().getElementById('txt2img_generate').cloneNode();
    button.id = id;
    button.classList.remove('gr-button-lg', 'gr-button-primary', 'lg', 'primary');
    button.classList.add(`gr-button-${size}`, `gr-button-${color}`, size, color);
    button.textContent = text;
    if (onClick) button.addEventListener('click', onClick);
    return button;
  }

  static tagFields() {
    const fields = document.createElement('div');
    fields.style.display = 'flex';
    fields.style.flexDirection = 'column';
    fields.style.margin = '4px 0';
    fields.style.padding = '6px';
    fields.style.border = '2px dashed #444';
    fields.style.borderRadius = '8px';
    fields.style.backgroundColor = 'var(--block-background-fill)';
    return fields;
  }

  static groupWrapper() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('eps-group-wrapper');
    wrapper.style.border = '2px solid #888';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '6px';
    wrapper.style.marginBottom = '8px';
    return wrapper;
  }

  static groupLabel(text, onClick, onToggle) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.cursor = 'pointer';
    row.style.marginBottom = '4px';

    const label = document.createElement('button');
    label.textContent = text;
    label.style.backgroundColor = '#225533';
    label.style.color = '#fff';
    label.style.border = '1px solid #337755';
    label.style.borderRadius = '6px';
    label.style.padding = '2px 10px';
    label.style.marginRight = '6px';
    label.style.fontWeight = 'bold';
    // 傳入 label 本身，讓 insertRandomPrompt 可更新高亮狀態
    label.addEventListener('click', () => onClick(label));

    const toggle = document.createElement('span');
    toggle.textContent = '⯆';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle(toggle);
    });

    row.appendChild(toggle);
    row.appendChild(label);
    return row;
  }

  static dropDown(id, options, { onChange }) {
    const select = document.createElement('select');
    select.id = id;
    select.classList.add('gr-box', 'gr-input');
    select.style.color = 'var(--body-text-color)';
    select.style.backgroundColor = 'var(--input-background-fill)';
    select.style.borderColor = 'var(--block-border-color)';
    select.style.borderRadius = 'var(--block-radius)';
    select.style.margin = '2px';
    select.style.minWidth = '120px';
    select.style.maxWidth = '180px';
    select.style.flex = '0 0 auto';
    select.addEventListener('change', (event) => onChange(event.target.value));

    const none = ['Nothing'].concat(options);
    none.forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      select.appendChild(option);
    });

    return select;
  }
}

function getPromptTextarea(type = 'txt2img', isNeg = false) {
  const id = `${type}_${isNeg ? 'neg_' : ''}prompt`;
  const phystonId = `phystonPrompt_${id}`;
  return (
    gradioApp().getElementById(id)?.querySelector('textarea') ||
    gradioApp().getElementById(phystonId)?.querySelector('textarea')
  );
}

class EasyPromptSelector {
  constructor(yaml, gradioApp) {
    this.yaml = yaml;
    this.gradioApp = gradioApp;
    this.visible = false;
    this.tags = {};
    this.history = [];
    this.redoStack = [];
    // lastPromptSnapshot 僅在使用者點擊「save all」時更新
    this.lastPromptSnapshot = { pos: '', neg: '' };
    this.PATH_FILE = 'tmp/easyPromptSelector.txt';
    this.AREA_ID = 'easy-prompt-selector';
    this.SELECT_ID = 'easy-prompt-selector-select';
    this.CONTENT_ID = 'easy-prompt-selector-content';
  }

  async init() {
    this.tags = await this.parseFiles();
    const existingArea = gradioApp().querySelector(`#${this.AREA_ID}`);
    if (existingArea) existingArea.remove();
    const topRow = gradioApp().getElementById('txt2img_toprow');
    const area = this.render();
    topRow.parentNode.insertBefore(area, topRow.nextSibling);
  }

  async readFile(filepath) {
    const response = await fetch(`file=${filepath}?${Date.now()}`);
    return await response.text();
  }

  async parseFiles() {
    const text = await this.readFile(this.PATH_FILE);
    if (text === '') return {};
    const tags = {};
    const paths = text.split(/\r?\n/);
    for (const path of paths) {
      const filename = path.split('/').pop().split('.')[0];
      const data = await this.readFile(path);
      this.yaml.loadAll(data, (doc) => { tags[filename] = doc; });
    }
    return tags;
  }

  changeVisibility(node, visible) {
    if (!node) return;
    node.style.display = visible ? 'block' : 'none';
  }

  // saveSnapshot 只在使用者點擊「save all」時呼叫
  saveSnapshot() {
    const pos = getPromptTextarea('txt2img', false)?.value || '';
    const neg = getPromptTextarea('txt2img', true)?.value || '';
    this.lastPromptSnapshot = { pos, neg };
  }

  // insertTagPrompt: 操作時不自動更新快照，由使用者點擊 save all 決定快照更新
  insertTagPrompt(value, button) {
    const isNeg = value.startsWith('neg-');
    const tagEscaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textarea = getPromptTextarea('txt2img', isNeg);
    if (!textarea) return;
    const regex = new RegExp(`(?:^|,\\s*)${tagEscaped}(?=,|$)`);
    if (regex.test(textarea.value)) {
      textarea.value = textarea.value
        .replace(regex, '')
        .replace(/(^\s*,)|(,\s*,)|(,\s*$)/g, '')
        .trim();
      if (button) button.classList.remove('eps-selected');
    } else {
      if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
        textarea.value += ', ';
      }
      textarea.value += value;
      if (button) button.classList.add('eps-selected');
    }
    // 不自動更新快照
    this.history.push({ type: isNeg ? 'neg' : 'pos', value: value, button: button });
    this.redoStack = [];
    textarea.dispatchEvent(new Event('input'));
  }

  // insertRandomPrompt: 用於分類標籤，與 insertTagPrompt 邏輯相同，不自動更新快照
  insertRandomPrompt(tag, button) {
    const textarea = getPromptTextarea('txt2img', false);
    if (!textarea) return;
    const tagEscaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|,\\s*)${tagEscaped}(?=,|$)`);
    if (regex.test(textarea.value)) {
      textarea.value = textarea.value
        .replace(regex, '')
        .replace(/(^\s*,)|(,\s*,)|(,\s*$)/g, '')
        .trim();
      if (button) button.classList.remove('eps-selected');
    } else {
      if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
        textarea.value += ', ';
      }
      textarea.value += tag;
      if (button) button.classList.add('eps-selected');
    }
    this.history.push({ type: 'pos', value: tag, button: button });
    this.redoStack = [];
    textarea.dispatchEvent(new Event('input'));
  }

  renderTagButtons(tags, prefix = '') {
    if (Array.isArray(tags)) {
      return tags.map((tag) => this.renderTagButton(tag.replace(/^neg-/, ''), tag));
    }
    return Object.keys(tags).map((key) => {
      const value = tags[key];
      const tagKey = `${prefix}:${key}`;
      if (typeof value === 'string') {
        return this.renderTagButton(key, value);
      }
      const values = Object.keys(value);
      if (values.length === 1 && typeof value[values[0]] === 'string') {
        return this.renderTagButton(key, value[values[0]]);
      }
      const wrapper = EPSElementBuilder.groupWrapper();
      const groupBody = document.createElement('div');
      groupBody.classList.add('eps-group-body');
      // 使用 Flex 排版
      groupBody.style.display = 'flex';
      groupBody.style.flexWrap = 'wrap';
      groupBody.style.justifyContent = 'flex-start';
      groupBody.style.alignItems = 'flex-start';
      groupBody.style.gap = '6px';
      const toggleRow = EPSElementBuilder.groupLabel(
        key,
        (labelButton) => this.insertRandomPrompt(`@${tagKey}@`, labelButton),
        (toggle) => {
          // 此處不作自動收起處理，只切換最後層
          const visible = groupBody.style.display !== 'none';
          groupBody.style.display = visible ? 'none' : 'flex';
          toggle.textContent = visible ? '⯈' : '⯆';
        }
      );
      const subTags = this.renderTagButtons(value, tagKey);
      subTags.forEach((btn) => groupBody.appendChild(btn));
      wrapper.appendChild(toggleRow);
      wrapper.appendChild(groupBody);
      return wrapper;
    });
  }

  renderTagButton(title, value) {
    const button = document.createElement('button');
    button.textContent = title;
    button.style.margin = '2px';
    button.style.padding = '4px 10px';
    button.style.backgroundColor = '#223344';
    button.style.color = '#eee';
    button.style.border = '1px solid #445566';
    button.style.borderRadius = '6px';
    button.style.fontSize = '0.85rem';
    button.style.cursor = 'pointer';
    button.dataset.tagvalue = value;
    button.addEventListener('click', () => this.insertTagPrompt(value, button));
    return button;
  }

  // updateTagHighlighting: 根據目前輸入更新所有 tag 按鈕的高亮
  updateTagHighlighting() {
    const posVal = getPromptTextarea('txt2img', false)?.value || '';
    const negVal = getPromptTextarea('txt2img', true)?.value || '';
    const allTagButtons = document.querySelectorAll(`#${this.AREA_ID} button[data-tagvalue]`);
    allTagButtons.forEach(btn => {
      const tag = btn.dataset.tagvalue;
      const regex = new RegExp(`(?:^|,\\s*)${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=,|$)`);
      if (regex.test(posVal) || regex.test(negVal)) {
        btn.classList.add('eps-selected');
      } else {
        btn.classList.remove('eps-selected');
      }
    });
  }

  render() {
    const area = document.createElement('div');
    area.id = this.AREA_ID;
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    const controlRow = document.createElement('div');
    controlRow.style.display = 'flex';
    controlRow.style.flexWrap = 'wrap';
    controlRow.style.justifyContent = 'center';
    controlRow.style.gap = '6px';
    const dropdown = EPSElementBuilder.dropDown(this.SELECT_ID, Object.keys(this.tags), {
      onChange: (selected) => {
        const content = gradioApp().getElementById(this.CONTENT_ID);
        Array.from(content.childNodes).forEach((node) => {
          node.style.display = node.id === `easy-prompt-selector-container-${selected}` ? 'flex' : 'none';
        });
        this.expandAllInCurrentSection();
      }
    });
    controlRow.appendChild(dropdown);
    controlRow.appendChild(EPSElementBuilder.baseButton('↩ Undo', { size: 'lg', color: 'secondary', onClick: () => this.undoLastTag() }));
    controlRow.appendChild(EPSElementBuilder.baseButton('↪ Redo', { size: 'lg', color: 'secondary', onClick: () => this.redoLastTag() }));
    controlRow.appendChild(EPSElementBuilder.baseButton('⯆ 展開全部', { size: 'lg', color: 'secondary', onClick: () => this.expandAllInCurrentSection() }));
    // 修改這裡的 expand/collapse：只收起最下層的部分
    controlRow.appendChild(EPSElementBuilder.baseButton('⯈ 收起全部', { size: 'lg', color: 'secondary', onClick: () => this.collapseOnlyLeafSections() }));
    controlRow.appendChild(EPSElementBuilder.baseButton('🧹 Clear Prompt', { size: 'lg', color: 'secondary', onClick: () => this.clearPrompt() }));
    const contentWrap = document.createElement('div');
    contentWrap.id = this.CONTENT_ID;
    contentWrap.style.marginTop = '0px';
    const savePasteBtn = EPSElementBuilder.baseButton('save all', {
      size: 'lg',
      color: 'secondary',
      id: 'save-paste-btn',
      onClick: () => this.handleSavePaste(savePasteBtn)
    });
    savePasteBtn.style.backgroundColor = '#f44336';
    controlRow.appendChild(savePasteBtn);
    Object.keys(this.tags).forEach((key) => {
      const values = this.tags[key];
      const fields = EPSElementBuilder.tagFields();
      fields.id = `easy-prompt-selector-container-${key}`;
      fields.style.display = 'none';
      this.renderTagButtons(values, key).forEach((group) => fields.appendChild(group));
      contentWrap.appendChild(fields);
    });
    container.appendChild(controlRow);
    container.appendChild(contentWrap);
    area.appendChild(container);
    return area;
  }

  expandAllInCurrentSection() {
    const selected = document.getElementById(this.SELECT_ID)?.value;
    const section = gradioApp().getElementById(`easy-prompt-selector-container-${selected}`);
    if (!section) return;
    section.querySelectorAll('.eps-group-body').forEach(body => {
      if (body.style.display !== 'flex') {
        body.style.display = 'flex';
        const toggle = body.previousSibling?.querySelector('span');
        if (toggle) toggle.textContent = '⯆';
      }
    });
  }

  // 修改後的 collapseOnlyLeafSections: 僅收起沒有子 group 的最下層 eps-group-body
  collapseOnlyLeafSections() {
    const selected = document.getElementById(this.SELECT_ID)?.value;
    const section = gradioApp().getElementById(`easy-prompt-selector-container-${selected}`);
    if (!section) return;
    // 找出沒有 nested .eps-group-body 的 groupBody，即為葉節點
    const leafBodies = Array.from(section.querySelectorAll('.eps-group-body'))
      .filter(body => !body.querySelector('.eps-group-body'));
    leafBodies.forEach(body => {
      body.style.display = 'none';
      const toggle = body.previousSibling?.querySelector('span');
      if (toggle) toggle.textContent = '⯈';
    });
  }

  // Undo: 支援 paste 與 clear 操作
  undoLastTag() {
    if (this.history.length === 0) return;
    const last = this.history.pop();
    if (last.type === 'paste') {
      const field = last.field; // 'pos' 或 'neg'
      const textarea = getPromptTextarea('txt2img', field === 'neg');
      if (!textarea) return;
      textarea.value = last.previous;
      textarea.dispatchEvent(new Event('input'));
      this.redoStack.push(last);
      this.updateTagHighlighting();
    } else if (last.type === 'clear') {
      const posBox = getPromptTextarea('txt2img', false);
      const negBox = getPromptTextarea('txt2img', true);
      if (posBox) { posBox.value = last.pos; posBox.dispatchEvent(new Event('input')); }
      if (negBox) { negBox.value = last.neg; negBox.dispatchEvent(new Event('input')); }
      this.redoStack.push(last);
      this.updateTagHighlighting();
    } else {
      const textarea = getPromptTextarea('txt2img', last.type === 'neg');
      if (!textarea) return;
      const tags = last.value.split(',').map(t => t.trim()).filter(Boolean);
      tags.forEach(t => {
        textarea.value = textarea.value.replace(new RegExp(`(?:^|,\\s*)${t}`), '');
      });
      textarea.dispatchEvent(new Event('input'));
      if (last.button) {
        last.button.classList.remove('eps-selected');
      }
      this.redoStack.push(last);
      this.updateTagHighlighting();
    }
  }

  // Redo: 支援 paste 與 clear 操作
  redoLastTag() {
    if (this.redoStack.length === 0) return;
    const redo = this.redoStack.pop();
    if (redo.type === 'paste') {
      const field = redo.field;
      const textarea = getPromptTextarea('txt2img', field === 'neg');
      if (!textarea) return;
      let newVal = this.lastPromptSnapshot[field];
      textarea.value = newVal;
      textarea.dispatchEvent(new Event('input'));
      this.history.push(redo);
      this.updateTagHighlighting();
    } else if (redo.type === 'clear') {
      const posBox = getPromptTextarea('txt2img', false);
      const negBox = getPromptTextarea('txt2img', true);
      if (posBox) { posBox.value = ''; posBox.dispatchEvent(new Event('input')); }
      if (negBox) { negBox.value = ''; negBox.dispatchEvent(new Event('input')); }
      this.history.push(redo);
      this.updateTagHighlighting();
    } else {
      const textarea = getPromptTextarea('txt2img', redo.type === 'neg');
      if (!textarea) return;
      if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
        textarea.value += ', ';
      }
      textarea.value += redo.value;
      textarea.dispatchEvent(new Event('input'));
      if (redo.button) {
        redo.button.classList.add('eps-selected');
      }
      this.history.push(redo);
      this.updateTagHighlighting();
    }
  }

  // Clear: 清除輸入框與所有高亮，同時記錄清除前內容以供 Undo
  clearPrompt() {
    const posBox = getPromptTextarea('txt2img', false);
    const negBox = getPromptTextarea('txt2img', true);
    const previousPos = posBox ? posBox.value : '';
    const previousNeg = negBox ? negBox.value : '';
    this.history.push({ type: 'clear', pos: previousPos, neg: previousNeg });
    if (posBox) {
      posBox.value = '';
      posBox.dispatchEvent(new Event('input'));
    }
    if (negBox) {
      negBox.value = '';
      negBox.dispatchEvent(new Event('input'));
    }
    const allSelected = gradioApp().querySelectorAll('.eps-selected');
    allSelected.forEach(btn => btn.classList.remove('eps-selected'));
  }

  // handleSavePaste:
  // 當按鈕為 "save all" 時，記錄目前快照並切換狀態；
  // 當按鈕為 "paste all" 時，直接清空正、負輸入框，再覆蓋為快照內容，
  // 並記錄此操作 (type: 'paste') 以供 Undo/Redo，同時更新所有 tag 高亮狀態，
  // 覆蓋前會記錄目前內容作 Undo 用。
  handleSavePaste(btn) {
    if (btn.textContent.toLowerCase() === 'save all') {
      const pos = getPromptTextarea('txt2img', false)?.value || '';
      const neg = getPromptTextarea('txt2img', true)?.value || '';
      this.lastPromptSnapshot = { pos, neg };
      btn.textContent = 'paste all';
      btn.style.backgroundColor = '#4caf50';
    } else {
      // Paste 操作：先清空內容，再完全覆蓋為快照內容
      const posBox = getPromptTextarea('txt2img', false);
      const negBox = getPromptTextarea('txt2img', true);
      if (posBox) {
        const prevPos = posBox.value;
        posBox.value = this.lastPromptSnapshot.pos;
        posBox.dispatchEvent(new Event('input'));
        this.history.push({ type: 'paste', field: 'pos', pasted: this.lastPromptSnapshot.pos, previous: prevPos });
      }
      if (negBox) {
        const prevNeg = negBox.value;
        negBox.value = this.lastPromptSnapshot.neg;
        negBox.dispatchEvent(new Event('input'));
        this.history.push({ type: 'paste', field: 'neg', pasted: this.lastPromptSnapshot.neg, previous: prevNeg });
      }
      // 更新 tag 高亮依據新內容
      this.updateTagHighlighting();
      btn.textContent = 'save all';
      btn.style.backgroundColor = '#f44336';
    }
  }
}

onUiLoaded(async () => {
  const style = document.createElement('style');
  style.innerHTML = `
    .eps-selected {
      background-color: #336699 !important;
      border-color: #5588cc !important;
      color: #fff !important;
    }
  `;
  document.head.appendChild(style);

  const yaml = window.jsyaml;
  const eps = new EasyPromptSelector(yaml, gradioApp());

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '6px';
  controls.style.margin = '6px 0';

  controls.appendChild(EPSElementBuilder.baseButton('🔯提示詞', {
    size: 'sm',
    color: 'secondary',
    onClick: () => {
      const tagArea = gradioApp().getElementById(eps.AREA_ID);
      eps.changeVisibility(tagArea, eps.visible = !eps.visible);
    }
  }));

  controls.appendChild(EPSElementBuilder.baseButton('🔄 Reload', {
    size: 'sm',
    color: 'secondary',
    onClick: async () => await eps.init()
  }));

  gradioApp().getElementById('txt2img_actions_column').appendChild(controls);

  // 移除 observer 自動監聽功能
  await eps.init();
});
