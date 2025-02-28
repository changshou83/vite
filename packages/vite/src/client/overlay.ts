import type { ErrorPayload } from 'types/hmrPayload'

// injected by the hmr plugin when served
declare const __BASE__: string

const base = __BASE__ || '/'

// set :host styles to make playwright detect the element as visible
const template = /*html*/ `
<style>
:host {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  --monospace: 'SFMono-Regular', Consolas,
  'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --yellow: #e2aa53;
  --purple: #cfa4ff;
  --cyan: #2dd9da;
  --dim: #c9c9c9;

  --window-background: #181818;
  --window-color: #d8d8d8;
}

.backdrop {
  position: fixed;
  z-index: 99999;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  margin: 0;
  background: rgba(0, 0, 0, 0.66);
}

.window {
  font-family: var(--monospace);
  line-height: 1.5;
  width: 800px;
  color: var(--window-color);
  margin: 30px auto;
  padding: 25px 40px;
  position: relative;
  background: var(--window-background);
  border-radius: 6px 6px 8px 8px;
  box-shadow: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22);
  overflow: hidden;
  border-top: 8px solid var(--red);
  direction: ltr;
  text-align: left;
}

pre {
  font-family: var(--monospace);
  font-size: 16px;
  margin-top: 0;
  margin-bottom: 1em;
  overflow-x: scroll;
  scrollbar-width: none;
}

pre::-webkit-scrollbar {
  display: none;
}

.message {
  line-height: 1.3;
  font-weight: 600;
  white-space: pre-wrap;
}

.message-body {
  color: var(--red);
}

.plugin {
  color: var(--purple);
}

.file {
  color: var(--cyan);
  margin-bottom: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.frame {
  color: var(--yellow);
}

.stack {
  font-size: 13px;
  color: var(--dim);
}

.tip {
  font-size: 13px;
  color: #999;
  border-top: 1px dotted #999;
  padding-top: 13px;
}

code {
  font-size: 13px;
  font-family: var(--monospace);
  color: var(--yellow);
}

.file-link {
  text-decoration: underline;
  cursor: pointer;
}
</style>
<div class="backdrop" part="backdrop">
  <div class="window" part="window">
    <pre class="message" part="message"><span class="plugin" part="plugin"></span><span class="message-body" part="message-body"></span></pre>
    <pre class="file" part="file"></pre>
    <pre class="frame" part="frame"></pre>
    <pre class="stack" part="stack"></pre>
    <div class="tip" part="tip">
      Click outside or fix the code to dismiss.<br>
      You can also disable this overlay by setting
      <code part="config-option-name">server.hmr.overlay</code> to <code part="config-option-value">false</code> in <code part="config-file-name">vite.config.js.</code>
    </div>
  </div>
</div>
`

const fileRE = /(?:[a-zA-Z]:\\|\/).*?:\d+:\d+/g
const codeframeRE = /^(?:>?\s+\d+\s+\|.*|\s+\|\s*\^.*)\r?\n/gm

// Allow `ErrorOverlay` to extend `HTMLElement` even in environments where
// `HTMLElement` was not originally defined.
const { HTMLElement = class {} as typeof globalThis.HTMLElement } = globalThis
export class ErrorOverlay extends HTMLElement {
  root: ShadowRoot
  closeOnEsc: (e: KeyboardEvent) => void

  constructor(err: ErrorPayload['err'], links = true) {
    super()
    this.root = this.attachShadow({ mode: 'open' })
    this.root.innerHTML = template

    codeframeRE.lastIndex = 0
    const hasFrame = err.frame && codeframeRE.test(err.frame)
    const message = hasFrame
      ? err.message.replace(codeframeRE, '')
      : err.message
    if (err.plugin) {
      this.text('.plugin', `[plugin:${err.plugin}] `)
    }
    this.text('.message-body', message.trim())

    const [file] = (err.loc?.file || err.id || 'unknown file').split(`?`)
    if (err.loc) {
      this.text('.file', `${file}:${err.loc.line}:${err.loc.column}`, links)
    } else if (err.id) {
      this.text('.file', file)
    }

    if (hasFrame) {
      this.text('.frame', err.frame!.trim())
    }
    this.text('.stack', err.stack, links)

    this.root.querySelector('.window')!.addEventListener('click', (e) => {
      e.stopPropagation()
    })

    this.addEventListener('click', () => {
      this.close()
    })

    this.closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        this.close()
      }
    }

    document.addEventListener('keydown', this.closeOnEsc)
  }

  text(selector: string, text: string, linkFiles = false): void {
    const el = this.root.querySelector(selector)!
    if (!linkFiles) {
      el.textContent = text
    } else {
      let curIndex = 0
      let match: RegExpExecArray | null
      fileRE.lastIndex = 0
      while ((match = fileRE.exec(text))) {
        const { 0: file, index } = match
        if (index != null) {
          const frag = text.slice(curIndex, index)
          el.appendChild(document.createTextNode(frag))
          const link = document.createElement('a')
          link.textContent = file
          link.className = 'file-link'
          link.onclick = () => {
            fetch(`${base}__open-in-editor?file=` + encodeURIComponent(file))
          }
          el.appendChild(link)
          curIndex += frag.length + file.length
        }
      }
    }
  }
  close(): void {
    this.parentNode?.removeChild(this)
    document.removeEventListener('keydown', this.closeOnEsc)
  }
}

export const overlayId = 'vite-error-overlay'
const { customElements } = globalThis // Ensure `customElements` is defined before the next line.
if (customElements && !customElements.get(overlayId)) {
  customElements.define(overlayId, ErrorOverlay)
}
