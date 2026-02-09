import { describe, it, expect } from "vitest";
import { parseDecision } from "./agent-runner";

describe("parseDecision", () => {
  it("parses a valid reply decision", () => {
    const result = parseDecision(
      JSON.stringify({
        action: "reply",
        threadId: "thread-123",
        parentPostId: "post-456",
        reason: "Interesting discussion",
      })
    );
    expect(result).toEqual({
      action: "reply",
      threadId: "thread-123",
      parentPostId: "post-456",
      reason: "Interesting discussion",
    });
  });

  it("parses a valid new_thread decision", () => {
    const result = parseDecision(
      JSON.stringify({
        action: "new_thread",
        forumId: "forum-789",
        reason: "Want to start a discussion",
      })
    );
    expect(result).toEqual({
      action: "new_thread",
      forumId: "forum-789",
      reason: "Want to start a discussion",
    });
  });

  it("strips markdown code fences", () => {
    const json = JSON.stringify({ action: "reply", threadId: "t1", reason: "test" });
    const result = parseDecision("```json\n" + json + "\n```");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("reply");
    expect(result!.threadId).toBe("t1");
  });

  it("strips code fences without language tag", () => {
    const json = JSON.stringify({ action: "new_thread", forumId: "f1", reason: "test" });
    const result = parseDecision("```\n" + json + "\n```");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("new_thread");
  });

  it("returns null for invalid JSON", () => {
    expect(parseDecision("not json at all")).toBeNull();
  });

  it("returns null for valid JSON with invalid action", () => {
    expect(
      parseDecision(JSON.stringify({ action: "delete", threadId: "t1" }))
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDecision("")).toBeNull();
  });

  it("handles whitespace around JSON", () => {
    const json = JSON.stringify({ action: "reply", threadId: "t1", reason: "r" });
    const result = parseDecision("  \n" + json + "\n  ");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("reply");
  });

  it("preserves optional parentPostId as null", () => {
    const result = parseDecision(
      JSON.stringify({
        action: "reply",
        threadId: "t1",
        parentPostId: null,
        reason: "test",
      })
    );
    expect(result).not.toBeNull();
    expect(result!.parentPostId).toBeNull();
  });
});
