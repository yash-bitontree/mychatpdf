import { describe, expect, it } from "vitest";
import { citationPageLabel } from "./status";

describe("citationPageLabel", () => {
  it("labels pdf citations as pages", () => {
    expect(citationPageLabel("pdf", 7)).toBe("p. 7");
    expect(citationPageLabel("pdf", 12, 13)).toBe("pp. 12-13");
  });

  it("defaults to page labels when the format is unknown", () => {
    expect(citationPageLabel(undefined, 3)).toBe("p. 3");
  });

  it("labels pptx citations as slides", () => {
    expect(citationPageLabel("pptx", 4)).toBe("slide 4");
    expect(citationPageLabel("pptx", 4, 6)).toBe("slides 4-6");
  });

  it("labels docx, txt, and rtf citations as sections", () => {
    expect(citationPageLabel("docx", 2)).toBe("section 2");
    expect(citationPageLabel("txt", 1)).toBe("section 1");
    expect(citationPageLabel("rtf", 5, 6)).toBe("sections 5-6");
  });
});
