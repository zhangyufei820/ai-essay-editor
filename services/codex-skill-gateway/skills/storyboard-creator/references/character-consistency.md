# Character Consistency

Use an Anchor Traits system.

## Character Card

Each recurring character needs:

- `anchor_traits`: 2-3 stable visual lines that never change.
- `wardrobe`: clothes and color palette.
- `personality`: behavior and emotional baseline.
- optional `do_not_change`: age, hairstyle, glasses, silhouette, key prop.

Example:

```json
{
  "id": "char_teacher",
  "name": "沈老师",
  "role": "mentor",
  "anchor_traits": "Chinese male teacher in his 30s, warm calm eyes, short neat black hair, slim build, gentle confident expression.",
  "wardrobe": "white shirt under soft green cardigan, simple watch, no logo.",
  "personality": "patient, precise, encouraging"
}
```

## Prompt Pattern

Every prompt that includes the character should repeat the compact anchor:

```text
Chinese male teacher in his 30s, warm calm eyes, short neat black hair, slim build, white shirt under soft green cardigan
```

Do not use vague labels such as "same person" alone. Models often ignore them.

## Multi-character Scenes

Give each character a stable position and action:

```text
Teacher stands on the right beside the desk; student sits on the left holding a notebook.
```

## Consistency Warnings

Add production notes when:

- more than 3 recurring characters appear
- wardrobe changes are requested
- time jumps happen
- input references a celebrity, copyrighted character, or brand mascot
