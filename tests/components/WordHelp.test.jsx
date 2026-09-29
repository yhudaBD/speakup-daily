// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../src/services/ai.service", () => ({ aiService: { explainWord: vi.fn() } }));
vi.mock("../../src/utils/speechVoice", () => ({ speakNaturally: vi.fn() }));
const { aiService } = await import("../../src/services/ai.service");
const { speakNaturally } = await import("../../src/utils/speechVoice");
const { WordHighlight } = await import("../../src/components/practice/WordHighlight");
const { WordHelp } = await import("../../src/components/practice/WordHelp");

beforeEach(() => { aiService.explainWord.mockReset(); speakNaturally.mockReset(); });
afterEach(cleanup);

const results = [
  { word: "I'm", status: "correct", heard: "i am" },
  { word: "allergic", status: "correct", heard: "allergic" },
  { word: "to", status: "correct", heard: "to" },
  { word: "nuts", status: "incorrect", heard: "not" },
];

// User report, 2026-09-29: the words showed in reverse order in the
// right-to-left layout, and a missed word gave no way to learn it.
describe("WordHighlight", () => {
  it("shows the sentence's words left to right", () => {
    const { container } = render(<WordHighlight wordResults={results} onSelect={() => {}} />);
    expect(container.firstChild.getAttribute("dir")).toBe("ltr");
    expect(container.textContent).toMatch(/^I'm.*allergic.*to.*nuts/);
  });

  it("lets the user open help on a word that wasn't clear, and only on those", () => {
    const onSelect = vi.fn();
    render(<WordHighlight wordResults={results} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /nuts/ }));
    expect(onSelect).toHaveBeenCalledWith(results[3]);
  });
});

describe("WordHelp", () => {
  const props = { word: "nuts", heard: "not", sentence: "I'm allergic to nuts." };

  it("says what was heard and plays the word slowly", () => {
    render(<WordHelp {...props} />);
    expect(screen.getByText(/שמענו/).textContent).toContain("not");
    fireEvent.click(screen.getByRole("button", { name: /השמע לאט/ }));
    expect(speakNaturally).toHaveBeenCalledWith("nuts", expect.objectContaining({ rate: 0.7 }));
  });

  it("says when nothing was heard in the word's place", () => {
    render(<WordHelp {...props} heard="" />);
    expect(screen.getByText(/לא נשמעה/)).toBeTruthy();
  });

  it("shows how to say the word and what it means", async () => {
    aiService.explainWord.mockResolvedValue({ say_he: "נַאטְס", tip_he: "a קצרה, לא o", meaning_he: "אגוזים" });
    render(<WordHelp {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /איך אומרים/ })); });
    expect(aiService.explainWord).toHaveBeenCalledWith(expect.objectContaining({ word: "nuts", heard: "not", sentence: props.sentence }));
    expect(screen.getByText("נַאטְס")).toBeTruthy();
    expect(screen.getByText("a קצרה, לא o")).toBeTruthy();
    expect(screen.getByText(/אגוזים/)).toBeTruthy();
  });

  it("shows an error with a retry instead of made-up help", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    aiService.explainWord.mockRejectedValueOnce(new Error("down"));
    render(<WordHelp {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /איך אומרים/ })); });
    expect(screen.getByRole("alert")).toBeTruthy();
    aiService.explainWord.mockResolvedValueOnce({ say_he: "", tip_he: "נסה a", meaning_he: "" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /נסה שוב/ })); });
    expect(screen.getByText("נסה a")).toBeTruthy();
  });
});
