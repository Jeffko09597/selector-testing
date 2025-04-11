class EPSElementBuilder {
  static baseButton(text, { size = 'sm', color = 'primary' }) {
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
    const button = EPSElementBuilder.baseButton('↩ Undo Last', { size: 'sm', color: 'secondary' })
    button.classList.add('easy_prompt_selector_undo_button')
    button.addEventListener('click', onClick)
    return button
  }

  static redoButton({ onClick }) {
    const button = EPSElementBuilder.baseButton('↪ Redo', { size: 'sm', color: 'secondary' })
    button.classList.add('easy_prompt_selector_redo_button')
    button.addEventListener('click', onClick)
    return button
  }

  static areaContainer(id = undefined) {
    const container = gradioApp().getElementById('txt2img_results').cloneNode()
    container.id = id
    container.style.gap = 0
    container.style.display = 'none'
    return container
  }

  static tagButton({ title, onClick, onRightClick, color = 'primary' }) {
    const button = EPSElementBuilder.baseButton(title, { color })
    button.style.height = '2rem'
    button.style.flexGrow = '0'
    button.style.margin = '2px'
    button.addEventListener('click', onClick)
    button.addEventListener('contextmenu', onRightClick)
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
    select.addEventListener('change', (event) => onChange(event.target.value))
    ;['空'].concat(options).forEach((key) => {
      const option = document.createElement('option')
      option.value = key
      option.textContent = key
      select.appendChild(option)
    })
    return select
  }

  static checkbox(text, { onChange }) {
    const label = document.createElement('label')
    label.style.display = 'flex'
    label.style.alignItems = 'center'
    const checkbox = gradioApp().querySelector('input[type=checkbox]').cloneNode()
    checkbox.checked = false
    checkbox.addEventListener('change', (event) => onChange(event.target.checked))
    const span = document.createElement('span')
    span.style.marginLeft = 'var(--size-2, 8px)'
    span.textContent = text
    label.appendChild(checkbox)
    label.appendChild(span)
    return label
  }
}

class EasyPromptSelector {
  PATH_FILE = 'tmp/easyPromptSelector.txt'
  AREA_ID = 'easy-prompt-selector'
  SELECT_ID = 'easy-prompt-selector-select'
  CONTENT_ID = 'easy-prompt-selector-content'
  history = []
  redoStack = []

  constructor(yaml, gradioApp) {
    this.yaml = yaml
    this.gradioApp = gradioApp
    this.visible = false
    this.toNegative = false
    this.tags = undefined
  }

  async init() {
    this.tags = await this.parseFiles()
    const tagArea = gradioApp().querySelector(`#${this.AREA_ID}`)
    if (tagArea) {
      this.visible = false
      this.changeVisibility(tagArea, this.visible)
      tagArea.remove()
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
    settings.style.flex = '1'
    const checkbox = EPSElementBuilder.checkbox('负面', {
      onChange: (checked) => { this.toNegative = checked }
    })
    const undoButton = EPSElementBuilder.undoButton({ onClick: () => this.undoLastTag() })
    const redoButton = EPSElementBuilder.redoButton({ onClick: () => this.redoLastTag() })
    settings.appendChild(checkbox)
    settings.appendChild(undoButton)
    settings.appendChild(redoButton)
    row.appendChild(settings)

    const container = EPSElementBuilder.areaContainer(this.AREA_ID)
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
      return tags.map((tag) => this.renderTagButton(tag, tag))
    } else {
      return Object.keys(tags).map((key) => {
        const values = tags[key]
        const randomKey = `${prefix}:${key}`
        if (typeof values === 'string') return this.renderTagButton(key, values)
        const fields = EPSElementBuilder.tagFields()
        fields.style.flexDirection = 'column'
        fields.append(this.renderTagButton(key, `@${randomKey}@`))
        const buttons = EPSElementBuilder.tagFields()
        buttons.id = 'buttons'
        this.renderTagButtons(values, randomKey).forEach((button) => buttons.appendChild(button))
        fields.append(buttons)
        return fields
      })
    }
  }

  renderTagButton(title, value, color = 'primary') {
    return EPSElementBuilder.tagButton({
      title,
      onClick: (e) => {
        e.preventDefault()
        const isNegative = this.toNegative || e.metaKey || e.ctrlKey
        const id = isNegative ? 'txt2img_neg_prompt' : 'txt2img_prompt'
        const textarea = gradioApp().getElementById(id).querySelector('textarea')
        if (textarea.value.includes(value)) {
          textarea.value = textarea.value.replace(new RegExp(`(?:^|,\s*)${value}`), '')
        } else {
          if (textarea.value.trim() !== '' && !textarea.value.trim().endsWith(',')) {
            textarea.value += ', '
          }
          textarea.value += value
          this.history.push({ id, value })
          this.redoStack = []
        }
        textarea.dispatchEvent(new Event('input'))
      },
      onRightClick: (e) => {
        e.preventDefault()
        const isNegative = this.toNegative || e.metaKey || e.ctrlKey
        const id = isNegative ? 'txt2img_neg_prompt' : 'txt2img_prompt'
        const textarea = gradioApp().getElementById(id).querySelector('textarea')
        textarea.value = textarea.value.replace(new RegExp(`(?:^|,\s*)${value}`), '')
        textarea.dispatchEvent(new Event('input'))
      },
      color
    })
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
    node.style.display = visible ? 'flex' : 'none'
  }
}

onUiLoaded(async () => {
  yaml = window.jsyaml
  const eps = new EasyPromptSelector(yaml, gradioApp())
  const button = EPSElementBuilder.openButton({
    onClick: () => {
      const tagArea = gradioApp().querySelector(`#${eps.AREA_ID}`)
      eps.changeVisibility(tagArea, eps.visible = !eps.visible)
    }
  })
  const reloadButton = EPSElementBuilder.reloadButton({
    onClick: async () => await eps.init()
  })
  const actionColumn = gradioApp().getElementById('txt2img_actions_column')
  const container = document.createElement('div')
  container.classList.add('easy_prompt_selector_container')
  container.appendChild(button)
  container.appendChild(reloadButton)
  actionColumn.appendChild(container)
  await eps.init()
})
