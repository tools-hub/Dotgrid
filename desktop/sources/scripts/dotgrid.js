'use strict'

function Dotgrid () {
  const defaultTheme = {
    background: '#eee',
    f_high: '#000',
    f_med: '#999',
    f_low: '#ccc',
    f_inv: '#000',
    b_high: '#000',
    b_med: '#888',
    b_low: '#aaa',
    b_inv: '#ffb545'
  }

  // ISU

  this.install = function (host) {
    console.info('Dotgrid', 'Installing..')
    this.theme = new Theme(defaultTheme)
    this.history = new History()

    this.source = new Source(this)
    this.manager = new Manager(this)
    this.renderer = new Renderer(this)
    this.tool = new Tool(this)
    this.interface = new Interface(this)
    this.picker = new Picker(this)
    this.cursor = new Cursor(this)
    this.listener = new Listener(this)

    host.appendChild(this.renderer.el)

    this.manager.install()
    this.interface.install(host)
    this.theme.install(host, () => { this.update() })
  }

  this.start = function () {
    console.info('Dotgrid', 'Starting..')
    this.theme.start()
    this.tool.start()
    this.renderer.start()
    this.interface.start()

    // Add events
    document.addEventListener('mousedown', function (e) { dotgrid.cursor.down(e) }, false)
    document.addEventListener('mousemove', function (e) { dotgrid.cursor.move(e) }, false)
    document.addEventListener('contextmenu', function (e) { dotgrid.cursor.alt(e) }, false)
    document.addEventListener('mouseup', function (e) { dotgrid.cursor.up(e) }, false)
    document.addEventListener('copy', function (e) { dotgrid.copy(e) }, false)
    document.addEventListener('cut', function (e) { dotgrid.cut(e) }, false)
    document.addEventListener('paste', function (e) { dotgrid.paste(e) }, false)
    window.addEventListener('resize', function (e) { dotgrid.update() }, false)
    window.addEventListener('dragover', function (e) { e.stopPropagation(); e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
    window.addEventListener('drop', dotgrid.drag)

    this.source.new()

    setTimeout(() => { document.body.className += ' ready' }, 250)
  }

  this.update = function () {
    this.manager.update()
    this.interface.update()
    this.renderer.update()
  }

  this.clear = function () {
    this.history.clear()
    this.tool.reset()
    this.reset()
    this.renderer.update()
    this.interface.update(true)
  }

  this.reset = function () {
    this.tool.clear()
    this.update()
  }

  // Basics

  this.getSize = function () {
    return { markers: {
      w: parseInt(this.tool.settings.size.width / 15),
      h: parseInt(this.tool.settings.size.height / 15) }
    }
  }

  this.setSize = function (size = { width: 600, height: 300 }, ui = true, scale = window.devicePixelRatio) {
    size = { width: clamp(step(size.width, 15), 105, 1080), height: clamp(step(size.height, 15), 120, 1080) }

    this.tool.settings.size.width = size.width
    this.tool.settings.size.height = size.height

    console.log(this.tool.settings.size)

    try {
      const win = require('electron').remote.getCurrentWindow()
      win.setSize((size.width + 100) * scale, (size.height + 100) * scale, false)
    } catch (err) {
      console.log('No window')
    }

    this.renderer.resize(size)
    this.interface.update()
    this.renderer.update()
  }

  this.fitSize = function () {
    if (this.requireResize() === false) { return }
    console.log('Dotgrid', `Will resize to: ${printSize(this.getRequiredSize())}`)
    this.setWindowSize(this.getRequiredSize())
  }

  this.setWindowSize = function (size) {
    console.log('Dotgrid', `Resizing to ${printSize(size)}`)
    document.title = `Dotgrid — ${size.width}x${size.height}`
    const win = require('electron').remote.getCurrentWindow()
    win.setSize(size.width, size.height, false)
  }

  this.getWindowSize = function () {
    return { width: window.innerWidth, height: window.innerHeight }
  }

  this.getProjectSize = function () {
    return this.tool.settings.size
  }

  this.getPadding = function () {
    return { x: 90, y: 120 }
  }

  this.getPaddedSize = function () {
    const rect = this.getWindowSize()
    const pad = this.getPadding()
    return { width: rect.width - pad.x, height: rect.height - pad.y }
  }

  this.getRequiredSize = function () {
    const rect = this.getProjectSize()
    const pad = this.getPadding()
    return { width: step(rect.width, 15) + pad.x, height: step(rect.height, 15) + pad.y }
  }

  this.requireResize = function () {
    const _window = this.getWindowSize()
    const _required = this.getRequiredSize()
    const offset = { width: _window.width - _required.width, height: _window.height - _required.height }
    if (offset.width !== 0 || offset.height !== 0) {
      console.log(`Dotgrid`, `Require ${printSize(_required)}, but window is ${printSize(_window)}(${printSize(offset)})`)
      return true
    }
    return false
  }

  this.modZoom = function (mod = 0, set = false) {
    try {
      const { webFrame } = require('electron')
      const currentZoomFactor = webFrame.getZoomFactor()
      webFrame.setZoomFactor(set ? mod : currentZoomFactor + mod)
      console.log(window.devicePixelRatio)
    } catch (err) {
      console.log('Cannot zoom')
    }
  }

  this.setZoom = function (scale) {
    try {
      webFrame.setZoomFactor(scale)
    } catch (err) {
      console.log('Cannot zoom')
    }
  }

  // Events

  this.drag = function (e) {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files[0]
    const filename = file.path ? file.path : file.name ? file.name : ''

    if (filename.indexOf('.grid') < 0) { console.warn('Dotgrid', 'Not a .grid file'); return }

    const reader = new FileReader()

    reader.onload = function (e) {
      const data = e.target && e.target.result ? e.target.result : ''
      if (data && !isJson(data)) { return }
      dotgrid.tool.replace(JSON.parse(`${data}`))
      dotgrid.fitSize()
    }
    reader.readAsText(file)
  }

  this.copy = function (e) {
    dotgrid.renderer.update()

    if (e.target !== this.picker.input) {
      e.clipboardData.setData('text/source', dotgrid.tool.export(dotgrid.tool.layer()))
      e.clipboardData.setData('text/plain', dotgrid.tool.path())
      e.clipboardData.setData('text/html', dotgrid.manager.el.outerHTML)
      e.clipboardData.setData('text/svg+xml', dotgrid.manager.el.outerHTML)
      e.preventDefault()
    }

    dotgrid.renderer.update()
  }

  this.cut = function (e) {
    dotgrid.renderer.update()

    if (e.target !== this.picker.input) {
      e.clipboardData.setData('text/source', dotgrid.tool.export(dotgrid.tool.layer()))
      e.clipboardData.setData('text/plain', dotgrid.tool.export(dotgrid.tool.layer()))
      e.clipboardData.setData('text/html', dotgrid.manager.el.outerHTML)
      e.clipboardData.setData('text/svg+xml', dotgrid.manager.el.outerHTML)
      dotgrid.tool.layers[dotgrid.tool.index] = []
      e.preventDefault()
    }

    dotgrid.renderer.update()
  }

  this.paste = function (e) {
    if (e.target !== this.picker.el) {
      let data = e.clipboardData.getData('text/source')
      if (isJson(data)) {
        data = JSON.parse(data.trim())
        dotgrid.tool.import(data)
      }
      e.preventDefault()
    }

    dotgrid.renderer.update()
  }
}

String.prototype.capitalize = function () {
  return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase()
}

function printSize (size) { return `${size.width}x${size.height}` }
function isJson (text) { try { JSON.parse(text); return true } catch (error) { return false } }
function isEqual (a, b) { return a && b && a.x === b.x && a.y === b.y }
function clamp (v, min, max) { return v < min ? min : v > max ? max : v }
function step (v, s) { return Math.round(v / s) * s }
