// === EasyPromptSelector.js (Full Integration with All Features, Simplified Undo UI, Styling Fixes) ===

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
    fields.style.flex = '1 1 auto'
    fields.style.border = '1px solid var(--block-border-color,#374151)'
    fields.style.borderRadius = '6px'
    fields.style.padding = '4px'
    fields.style.margin = '2px 0'
    fields.style.backgroundColor = 'var(--block-background-fill)'
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
    row.style.flexWrap = 'wrap'

    const dropDown = this.renderDropdown()
    dropDown.style.flex = '1'
    row.appendChild(dropDown)

    const settings = document.createElement('div')
    settings.style.display = 'flex'
    settings.style.flexWrap = 'wrap'
    settings.style.gap = '10px'
    const undoButton = EPSElementBuilder.undoButton({ onClick: () => this.undoLastTag() })
    const redoButton = EPSElementBuilder.redoButton({ onClick: () => this.redoLastTag() })
    settings.appendChild(undoButton)
    settings.appendChild(redoButton)
    row.appendChild(settings)

    const container = document.createElement('div')
    container.id = this.AREA_ID
    container.style.position = 'relative'
    container.style.zIndex = '5'
    container.style.marginBottom = '10px'
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
    const button = document.createElement('button')
    button.textContent = title
    button.style.height = '1.6rem'
    button.style.margin = '2px'
    button.style.fontSize = '0.85rem'
    button.style.padding = '2px 6px'
    button.style.backgroundColor = '#223344'
    button.style.color = '#eee'
    button.style.border = '1px solid #445566'
    button.style.borderRadius = '6px'
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
