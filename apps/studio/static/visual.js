// Brand OS Studio: print view helper. Shows the print button only when scripting works; without it the browser's
// own Print command does the same. No data, no network, no storage.
document.addEventListener('DOMContentLoaded', () => {
  for (const button of document.querySelectorAll('[data-print]')) {
    button.hidden = false
    button.addEventListener('click', () => window.print())
  }
})
