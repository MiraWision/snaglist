// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyMask } from "../src/mask";

afterEach(() => {
  document.body.innerHTML = "";
});

function html(markup: string): void {
  document.body.innerHTML = markup;
}

describe("applyMask", () => {
  it("masks input/textarea/select only when maskInputs is set", () => {
    html(`
      <input value="4242 4242 4242 4242" />
      <textarea>secret notes</textarea>
      <select><option selected>Gold plan</option></select>
      <p>public text</p>
    `);
    const off = applyMask({});
    expect(off.count).toBe(0);
    off.restore();

    const on = applyMask({ maskInputs: true });
    expect(on.count).toBe(3);
    const input = document.querySelector("input") as HTMLInputElement;
    expect(input.style.getPropertyValue("color")).toBe("transparent");
    expect(input.style.getPropertyPriority("color")).toBe("important");
    expect(input.style.getPropertyValue("background-color")).not.toBe("");
    on.restore();
  });

  it("always masks [data-private], even without maskInputs", () => {
    html(`<div data-private>secret@example.com</div><div>public</div>`);
    const result = applyMask({});
    expect(result.count).toBe(1);
    result.restore();
  });

  it("masks extra maskSelectors", () => {
    html(`<span class="pii">token</span><span>ok</span>`);
    const result = applyMask({ maskSelectors: [".pii"] });
    expect(result.count).toBe(1);
    result.restore();
  });

  it("never masks the widget's own UI", () => {
    html(`
      <div data-feedback-widget><input value="widget internal" /></div>
      <input value="page field" />
    `);
    const result = applyMask({ maskInputs: true });
    expect(result.count).toBe(1); // only the page field, not the widget input
    result.restore();
  });

  it("restores the DOM byte-for-byte after masking (innerHTML identical)", () => {
    html(`
      <form>
        <input id="card" value="4242 4242 4242 4242" />
        <input class="plain" style="margin:4px" value="x" />
        <div data-private>Anna K.</div>
      </form>
    `);
    const before = document.body.innerHTML;
    const result = applyMask({ maskInputs: true });
    expect(result.count).toBe(3);
    // Live DOM is mutated while masking is active.
    expect(document.body.innerHTML).not.toBe(before);
    result.restore();
    // …and byte-identical afterwards, including the pre-existing inline style.
    expect(document.body.innerHTML).toBe(before);
  });

  it("leaves no empty style attribute on elements that had none", () => {
    html(`<input value="x" />`);
    const before = document.body.innerHTML;
    expect(before).not.toContain("style");
    const result = applyMask({ maskInputs: true });
    result.restore();
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector("input")?.hasAttribute("style")).toBe(false);
  });

  it("restore is idempotent", () => {
    html(`<div data-private>x</div>`);
    const before = document.body.innerHTML;
    const result = applyMask({});
    result.restore();
    result.restore();
    expect(document.body.innerHTML).toBe(before);
  });
});
