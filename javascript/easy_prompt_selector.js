// === EasyPromptSelector.js (Full Integration with All Features) ===

class EPSElementBuilder {
  static baseButton(text, { size = 'lg', color = 'primary' }) {
    const button = gradioApp().getElementById('txt2img_generate').cloneNode()
    button.id = ''
    button.classList.remove('gr-button-lg', 'gr-button-primary', 'lg', 'primary')
    button.classList.add(`gr-button-${size}`, `gr-button-${color}`, size, color)
    button.textContent = text
    return button
  }

  static tagFields() {
    const fields = document.createElement('div')
    fields.style.display = 'flex'
    fields.style.flexDirection = 'row'
    fields.style.flexWrap = 'wrap'
    fields.style.minWidth = 'min(320px, 100%)'
    fields.style.maxWidth = '100%'
    fields.style.flex = '1 calc(50% - 20px)'
    fields.style.borderWidth = '1px'
    fields.style.borderColor = 'var(--block-border-color,#374151)'
    fields.style.borderRadius = 'var(--block-radius,8px)'
    fields.style.padding = '8px'
    fields.style.height = 'fit-content'
    return fields
  }

  static openButton({ onClick }) {
    const button = EPSElementBuilder.baseButton('🔯提示词', { size: 'sm', color: 'secondary' })
    button.classList.add('easy_prompt_selector_button')
    button.addEventListener('click', onClick)
    return button
  }

  static reloadButton({ onClick }) {
    const button = EPSElementBuilder.baseButton('🔄 Reload', { size: 'sm', color: 'secondary' })
    button.classList.add('easy_prompt_selector_reload_button')
    button.addEventListener('click', onClick)
    return button
  }

  static undoButton({ onClick }) {
    const button = EPSElementBuilder.baseButton('↩ Undo', { size: 'lg', color: 'secondary' })
    button.classList.add('easy_prompt_selector_undo_button')
    button.addEventListener('click', onClick)
    return button
  }

  static redoButton({ onClick }) {
    const button = EPSElementBuilder.baseButton('↪ Redo', { size: 'lg', color: 'secondary' })
    button.classList.add('easy_prompt_selector_redo_button')
    button.addEventListener('click', onClick)
    return button
  }

  static undoSelect(options, { onChange }) {
    const select = document.createElement('select')
    select.classList.add('gr-box', 'gr-input')
    select.style.marginLeft = '10px'
    options.forEach((entry, index) => {
      const opt = document.createElement('option')
      opt.value = index
      opt.textContent = `${entry.value}`
      select.appendChild(opt)
    })
    select.addEventListener('change', (e) => onChange(parseInt(e.target.value)))
    return select
  }

  static dropDown(id, options, { onChange }) {
    const select = document.createElement('select')
    select.id = id
    select.classList.add('gr-box', 'gr-input')
    select.style.color = 'var(--body-text-color)'
    select.style.backgroundColor = 'var(--input-background-fill)'
    select.style.borderColor = 'var(--block-border-color)'
    select.style.borderRadius = 'var(--block-radius)'
    select.style.margin = '2px'
    select.addEventListener('change', (event) => {
      onChange(event.target.value)
    })

    const none = ['Nothing'].concat(options)
    none.forEach((key) => {
      const option = document.createElement('option')
      option.value = key
      option.textContent = key
      select.appendChild(option)
    })

    return select
  }
}

class EasyPromptSelector {
  constructor(yaml, gradioApp) {
    this.yaml = yaml
    this.gradioApp = gradioApp
    this.visible = false
    this.tags = {}
    this.history = []
    this.redoStack = []
    this.PATH_FILE = 'tmp/easyPromptSelector.txt'
    this.AREA_ID = 'easy-prompt-selector'
    this.SELECT_ID = 'easy-prompt-selector-select'
    this.CONTENT_ID = 'easy-prompt-selector-content'
  }

  async init() {
    this.tags = await this.parseFiles()
    const existingArea = gradioApp().querySelector(`#${this.AREA_ID}`)
    if (existingArea) {
      const dropdown = this.renderDropdown()
      const content = this.renderContent()
      const row = existingArea.firstChild
      row.replaceChild(dropdown, row.firstChild)
      existingArea.replaceChild(content, existingArea.lastChild)
      return
    }
    gradioApp().getElementById('txt2img_toprow').after(this.render())
  }

  async readFile(filepath) {
    const response = await fetch(`file=${filepath}?${Date.now()}`)
    return await response.text()
  }

  async parseFiles() {
    const text = await this.readFile(this.PATH_FILE)
    if (text === '') return {}
    const tags = {}
    const paths = text.split(/\r\n|\n/)
    for (const path of paths) {
      const filename = path.split('/').pop().split('.')[0]
      const data = await this.readFile(path)
      this.yaml.loadAll(data, (doc) => { tags[filename] = doc })
    }
    return tags
  }

  render() {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '10px'

    const dropDown = this.renderDropdown()
    dropDown.style.flex = '1'
    row.appendChild(dropDown)

    const settings = document.createElement('div')
    settings.style.flex = '2'
    const undoButton = EPSElementBuilder.undoButton({ onClick: () => this.undoLastTag() })
    const redoButton = EPSElementBuilder.redoButton({ onClick: () => this.redoLastTag() })
    const undoSelect = EPSElementBuilder.undoSelect(this.history, (index) => this.undoTo(index))
    settings.appendChild(undoButton)
    settings.appendChild(redoButton)
    settings.appendChild(undoSelect)
    row.appendChild(settings)

    const container = document.createElement('div')
    container.id = this.AREA_ID
    container.appendChild(row)
    container.appendChild(this.renderContent())
    return container
  }

  renderDropdown() {
    return EPSElementBuilder.dropDown(this.SELECT_ID, Object.keys(this.tags), {
      onChange: (selected) => {
        const content = gradioApp().getElementById(this.CONTENT_ID)
        Array.from(content.childNodes).forEach((node) => {
          this.changeVisibility(node, node.id === `easy-prompt-selector-container-${selected}`)
        })
      }
    })
  }

  renderContent() {
    const content = document.createElement('div')
    content.id = this.CONTENT_ID
    Object.keys(this.tags).forEach((key) => {
      const values = this.tags[key]
      const fields = EPSElementBuilder.tagFields()
      fields.id = `easy-prompt-selector-container-${key}`
      fields.style.display = 'none'
      fields.style.marginTop = '10px'
      this.renderTagButtons(values, key).forEach((group) => fields.appendChild(group))
      content.appendChild(fields)
    })
    return content
  }

  renderTagButtons(tags, prefix = '') {
    if (Array.isArray(tags)) {
      return tags.map((tag) => this.renderTagButton(tag.replace(/^neg-/, ''), tag))
    } else {
      return Object.keys(tags).map((key) => {
        const values = tags[key]
        const randomKey = `${prefix}:${key}`
        if (typeof values === 'string') return this.renderTagButton(key, values)
        const fields = EPSElementBuilder.tagFields()
        fields.style.flexDirection = 'column'
        fields.append(this.renderTagButton(key, `@${randomKey}@`))
        const buttons = EPSElementBuilder.tagFields()
        this.renderTagButtons(values, randomKey).forEach((button) => buttons.appendChild(button))
        fields.append(buttons)
        return fields
      })
    }
  }

  renderTagButton(title, value, color = 'primary') {
    const button = EPSElementBuilder.baseButton(title, { color, size: 'sm' })
    button.addEventListener('click', (e) => {
      e.preventDefault()
      const isNegative = value.startsWith('neg-')
      const val = isNegative ? value.slice(4) : value
      const id = isNegative ? 'txt2img_neg_prompt' : 'txt2img_prompt'
      const textarea = gradioApp().getElementById(id).querySelector('textarea')
      if (textarea.value.includes(val)) {
        textarea.value = textarea.value.replace(new RegExp(`(?:^|,\s*)${val}`), '')
      } else {
        if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
          textarea.value += ', '
        }
        textarea.value += val
        this.history.push({ id, value: val })
        this.redoStack = []
      }
      textarea.dispatchEvent(new Event('input'))
    })
    return button
  }

  undoLastTag() {
    if (this.history.length === 0) return
    const last = this.history.pop()
    const textarea = gradioApp().getElementById(last.id).querySelector('textarea')
    textarea.value = textarea.value.replace(new RegExp(`(?:^|,\s*)${last.value}`), '')
    textarea.dispatchEvent(new Event('input'))
    this.redoStack.push(last)
  }

  undoTo(index) {
    while (this.history.length > index + 1) {
      this.undoLastTag()
    }
  }

  redoLastTag() {
    if (this.redoStack.length === 0) return
    const redo = this.redoStack.pop()
    const textarea = gradioApp().getElementById(redo.id).querySelector('textarea')
    if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
      textarea.value += ', '
    }
    textarea.value += redo.value
    textarea.dispatchEvent(new Event('input'))
    this.history.push(redo)
  }

  changeVisibility(node, visible) {
    if (!node) return
    node.style.display = visible ? 'flex' : 'none'
  }
}

onUiLoaded(async () => {
  yaml = window.jsyaml
  const eps = new EasyPromptSelector(yaml, gradioApp())
  const button = EPSElementBuilder.openButton({
    onClick: () => {
      const tagArea = gradioApp().getElementById(eps.AREA_ID)
      eps.changeVisibility(tagArea, eps.visible = !eps.visible)
    }
  })
  const reloadButton = EPSElementBuilder.reloadButton({ onClick: async () => await eps.init() })
  const actionColumn = gradioApp().getElementById('txt2img_actions_column')
  const container = document.createElement('div')
  container.classList.add('easy_prompt_selector_container')
  container.appendChild(button)
  container.appendChild(reloadButton)
  actionColumn.appendChild(container)
  await eps.init()
})
