// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../../src/services/ai.service", () => ({ aiService: { analyzeConversation: vi.fn() } }));
const { aiService } = await import("../../src/services/ai.service");
const { useConversationAnalysis } = await import("../../src/hooks/useConversationAnalysis");

const feedback = { overall_score: 75, rubric: { fluency: 4, grammar: 3, vocabulary: 5 }, summary: "טוב" };
const turns = (n) => Array.from({ length: n }, (_, i) => ({ role: "user", content: `t${i}`, source: "spoken" }));

beforeEach(() => aiService.analyzeConversation.mockReset());

// CRITICAL_REVIEW.md §14: the analysis used to run only if the user tapped
// "analyze", so the level followed the conversations they chose to show.
describe("useConversationAnalysis", () => {
  it("analyzes a conversation with 4 turns of the user's own by itself, once", async () => {
    aiService.analyzeConversation.mockResolvedValue(feedback);
    const onSaved = vi.fn();
    const props = { chatId: "c1", messages: turns(4), topicTitle: "Café", savedFeedback: null, onSaved };
    const { result, rerender } = renderHook((p) => useConversationAnalysis(p), { initialProps: props });
    await waitFor(() => expect(result.current.feedback).toEqual(feedback));
    rerender({ ...props });
    expect(aiService.analyzeConversation).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith("c1", feedback);
  });

  it("waits for the user to ask when the conversation was shorter", async () => {
    aiService.analyzeConversation.mockResolvedValue(feedback);
    const { result } = renderHook(() =>
      useConversationAnalysis({ chatId: "c1", messages: turns(3), topicTitle: "Café", savedFeedback: null, onSaved: vi.fn() }));
    expect(aiService.analyzeConversation).not.toHaveBeenCalled();
    await act(() => result.current.analyze());
    expect(result.current.feedback).toEqual(feedback);
  });

  it("doesn't analyze again when feedback was saved", () => {
    renderHook(() =>
      useConversationAnalysis({ chatId: "c1", messages: turns(5), topicTitle: "Café", savedFeedback: feedback, onSaved: vi.fn() }));
    expect(aiService.analyzeConversation).not.toHaveBeenCalled();
  });

  it("shows an error with a retry when the analysis fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    aiService.analyzeConversation.mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() =>
      useConversationAnalysis({ chatId: "c1", messages: turns(4), topicTitle: "Café", savedFeedback: null, onSaved: vi.fn() }));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.feedback).toBeNull();
  });
});
