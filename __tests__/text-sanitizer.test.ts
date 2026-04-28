import { cleanLLMText } from "@/lib/text-sanitizer"

describe("cleanLLMText", () => {
  it("preserves LaTeX commands that start with n or t", () => {
    const input = String.raw`$\text{Im}\, z > 0,\quad ad-bc\neq 0,\quad \nabla f$`

    expect(cleanLLMText(input)).toBe(input)
  })

  it("normalizes escaped math delimiters", () => {
    const input = String.raw`\$\$w=\frac{az+b}{cz+d}\$\$ and \(z \in \mathbb{R}\)`

    expect(cleanLLMText(input)).toBe(String.raw`$$w=\frac{az+b}{cz+d}$$ and $z \in \mathbb{R}$`)
  })

  it("still converts literal newline and tab escapes outside LaTeX commands", () => {
    expect(cleanLLMText(String.raw`第一行\n第二行\t缩进`)).toBe("第一行\n第二行\t缩进")
  })
})
