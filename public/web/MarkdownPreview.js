/** A deliberately small Markdown preview: safe DOM creation, never raw HTML. */
export class MarkdownPreview {
  constructor(target) {
    this.target = target;
  }

  render(source) {
    this.target.replaceChildren();
    let list = null;
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        list = null;
        continue;
      }
      if (/^---+$/.test(trimmed)) {
        list = null;
        this.target.append(document.createElement("hr"));
        continue;
      }
      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        list = null;
        const node = document.createElement(`h${heading[1].length}`);
        this._fillInline(node, heading[2]);
        this.target.append(node);
        continue;
      }
      const listItem = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
      if (listItem) {
        if (!list) {
          list = document.createElement("ul");
          this.target.append(list);
        }
        const item = document.createElement("li");
        this._fillInline(item, listItem[1]);
        list.append(item);
        continue;
      }
      list = null;
      const quoted = trimmed.startsWith(">");
      const node = document.createElement(quoted ? "blockquote" : "p");
      this._fillInline(node, quoted ? trimmed.replace(/^>\s?/, "") : trimmed);
      this.target.append(node);
    }
  }

  _fillInline(node, value) {
    const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        const bold = document.createElement("strong");
        bold.textContent = part.slice(2, -2);
        node.append(bold);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        node.append(code);
      } else {
        node.append(document.createTextNode(part));
      }
    }
  }
}
