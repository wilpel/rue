import { describe, it, expect } from "vitest";
import { helloWorld } from "../src/helloWorld";

describe("helloWorld", () => {
  it("returns 'Hello, World!'", () => {
    expect(helloWorld()).toBe("Hello, World!");
  });
});
