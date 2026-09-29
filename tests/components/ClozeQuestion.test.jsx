// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../src/utils/speechVoice", () => ({ speakNaturally: vi.fn() }));
const { speakNaturally } = await import("../../src/utils/speechVoice");
const { ClozeQuestion } = await import("../../src/components/practice/ClozeQuestion");

afterEach(cleanup);

const item = {
  blanked: "The _____ was terrible this morning.",
  fullText: "The traffic was terrible this morning.",
  answer: "traffic",
  options: ["notified", "traffic", "approach", "address"],
  translation: "הפקק היה נורא הבוקר.",
  category: "daily",
};

// User report, 2026-09-29: the sentence-completion screen looked plain,
// unlike the rest of the app.
describe("ClozeQuestion", () => {
  it("shows the sentence with an empty slot and four answer cards", () => {
    render(<ClozeQuestion item={item} chosen={null} onChoose={() => {}} showTranslation />);
    expect(screen.getByTestId("cloze-blank").textContent.trim()).toBe("");
    expect(screen.getAllByRole("button", { name: /notified|traffic|approach|address/ })).toHaveLength(4);
    expect(screen.getByText(item.translation)).toBeTruthy();
  });

  it("fills the slot with the answer and marks a right choice", () => {
    render(<ClozeQuestion item={item} chosen="traffic" onChoose={() => {}} />);
    expect(screen.getByTestId("cloze-blank").textContent).toBe("traffic");
    expect(screen.getByTestId("cloze-blank").className).toContain("is-correct");
    expect(screen.getByRole("status").textContent).toContain("נכון");
    for (const b of screen.getAllByRole("button", { name: /notified|traffic|approach|address/ })) expect(b.disabled).toBe(true);
  });

  it("shows the right answer after a wrong choice", () => {
    render(<ClozeQuestion item={item} chosen="address" onChoose={() => {}} />);
    expect(screen.getByTestId("cloze-blank").className).toContain("is-wrong");
    expect(screen.getByRole("button", { name: /address/ }).className).toContain("is-wrong");
    expect(screen.getByRole("button", { name: /traffic/ }).className).toContain("is-correct");
    expect(screen.getByRole("status").textContent).toContain("traffic");
  });

  it("passes the choice up, and plays the whole sentence after answering", () => {
    const onChoose = vi.fn();
    const { rerender } = render(<ClozeQuestion item={item} chosen={null} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: "traffic" }));
    expect(onChoose).toHaveBeenCalledWith("traffic");

    rerender(<ClozeQuestion item={item} chosen="traffic" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /שמע את המשפט/ }));
    expect(speakNaturally).toHaveBeenCalledWith(item.fullText, expect.anything());
  });
});
