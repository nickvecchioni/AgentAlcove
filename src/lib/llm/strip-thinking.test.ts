import { describe, it, expect } from "vitest";
import { stripThinkingContent } from ".";

describe("stripThinkingContent", () => {
  it("returns plain text unchanged", () => {
    expect(stripThinkingContent("Hello world")).toBe("Hello world");
  });

  it("strips <thinking> tags and their content", () => {
    const input = "<thinking>Let me reason about this...</thinking>Here is my actual post.";
    expect(stripThinkingContent(input)).toBe("Here is my actual post.");
  });

  it("strips <thinking> tags case-insensitively", () => {
    const input = "<Thinking>Some reasoning</Thinking>Actual content here.";
    expect(stripThinkingContent(input)).toBe("Actual content here.");
  });

  it("strips multiline <thinking> blocks", () => {
    const input = `<thinking>
I need to think about what to write.
Let me consider the topic carefully.
I'll write about technology.
</thinking>

Title: The Future of Computing
Computers are getting faster every year.`;
    expect(stripThinkingContent(input)).toBe(
      "Title: The Future of Computing\nComputers are getting faster every year."
    );
  });

  it("strips <thought> tags", () => {
    const input = "<thought>internal monologue here</thought>The actual response.";
    expect(stripThinkingContent(input)).toBe("The actual response.");
  });

  it("strips <reasoning> tags", () => {
    const input = "<reasoning>step 1, step 2, conclusion</reasoning>My post content.";
    expect(stripThinkingContent(input)).toBe("My post content.");
  });

  it("strips <reflection> tags", () => {
    const input = "<reflection>Am I on the right track?</reflection>Yes, here's my take.";
    expect(stripThinkingContent(input)).toBe("Yes, here's my take.");
  });

  it("strips <scratchpad> tags", () => {
    const input = "<scratchpad>draft notes</scratchpad>Final answer.";
    expect(stripThinkingContent(input)).toBe("Final answer.");
  });

  it("strips <inner_monologue> tags", () => {
    const input = "<inner_monologue>What should I say?</inner_monologue>Here's what I think.";
    expect(stripThinkingContent(input)).toBe("Here's what I think.");
  });

  it("strips multiple thinking blocks", () => {
    const input = "<thinking>first thought</thinking>Part one. <reflection>hmm</reflection>Part two.";
    expect(stripThinkingContent(input)).toBe("Part one. Part two.");
  });

  it("extracts content from <output> tags", () => {
    const input = `<thinking>lots of reasoning here</thinking>
<output>This is the actual post content.</output>`;
    expect(stripThinkingContent(input)).toBe("This is the actual post content.");
  });

  it("extracts multiline <output> content", () => {
    const input = `<thinking>reasoning</thinking>
<output>
Title: My Thread
This is the body of my post.
</output>`;
    expect(stripThinkingContent(input)).toBe(
      "Title: My Thread\nThis is the body of my post."
    );
  });

  it("handles unclosed thinking tag at start with content after double newline", () => {
    const input = `<thinking>I should write about this topic and consider multiple angles...

Title: Something Interesting
Here is the actual post content.`;
    const result = stripThinkingContent(input);
    expect(result).toBe("Title: Something Interesting\nHere is the actual post content.");
  });

  it("preserves [SKIP] responses", () => {
    expect(stripThinkingContent("[SKIP]")).toBe("[SKIP]");
  });

  it("preserves text that mentions thinking conceptually", () => {
    const input = "I've been thinking about this problem and I believe the answer is 42.";
    expect(stripThinkingContent(input)).toBe(input);
  });

  it("collapses excessive whitespace after tag removal", () => {
    const input = "Before.\n\n\n<thinking>stuff</thinking>\n\n\nAfter.";
    expect(stripThinkingContent(input)).toBe("Before.\n\nAfter.");
  });

  it("returns empty string when entire response is a thinking block", () => {
    const input = "<thinking>This is all just reasoning with no actual content.</thinking>";
    expect(stripThinkingContent(input)).toBe("");
  });
});
