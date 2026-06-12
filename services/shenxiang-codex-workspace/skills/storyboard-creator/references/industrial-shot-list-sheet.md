# Industrial Shot List Sheet Reference

Use this reference when the user asks for a professional storyboard sheet, shot list, production document, film table, video generation plan, or a rendered image prompt for the sheet itself.

## Identity

The deliverable is a production working sheet, not a comic, moodboard, or presentation. It should feel like a dense film-unit document that a DP, gaffer, art team, and actor can check before shooting.

Primary qualities:

- Information density over beauty.
- Field precision over decoration.
- Checkable continuity over expressive flourish.
- Full-canvas table, zero physical decoration.

## Seven-Dimension Inference

Infer and record:

1. `target_platform`: Douyin/Xiaohongshu short, 30s ad, short drama, film scene.
2. `genre_tone`: drama, action, horror, comedy, documentary, commercial, MV.
3. `scene_property`: `INT.`, `EXT.`, or `MIXED`.
4. `story_beat`: opening, development, turn, climax, resolve.
5. `reference_image_types`: character, scene, prop, start_frame, end_frame.
6. `aspect_ratio`: `16:9`, `9:16`, `2.39:1`, or another requested ratio.
7. `visual_style`: realistic, documentary, ink, cyberpunk, cartoon, commercial, etc.

These dimensions must change shot count, time allocation, camera movement, frame thumbnail prompt, and gateway model hints.

## Layout

Use a vertical multi-row table with fixed seven columns:

| Column | Width | Rule |
|---|---:|---|
| `No.` | 6% | `SHOT 01`, continuous. |
| `Frame` | 22% | Thumbnail prompt or frame note matching the row. |
| `Timecode` | 10% | `00:00-00:02 / 2.0s`. |
| `Visual·Camera·Movement` | 22% | 30-60 Chinese characters. |
| `Dialog·SFX` | 14% | Dialogue under 30 Chinese characters + SFX/MUS notes. |
| `Cut·Shot Size·Movement` | 14% | Cut + size + angle + movement. |
| `Camera Settings` | 12% | `28mm f/8 ISO 400` fixed format. |

Header:

`Project Title · SC scene number · INT./EXT. · DAY/NIGHT · Director _____ · DP _____ · N SHOTS · target platform + aspect ratio`

Footer:

`Page X / N · Total Runtime XX.Xs · Rev. A · Effective Date YYYY-MM-DD · DP _____ · Director _____`

Use blank underlines for unknown signatures or metadata. Never invent names.

## Visual System

Default dark system:

- Background: `#1A1A1C`
- Structural lines: `#2A2A2D`
- Main title: `#EEEEEE`
- Metadata: `#B8B8BC`
- Shot label: `#D4A574`
- Key shot: `#FFD400`
- Movement annotation: `#7A7670`

Optional warm print variant is allowed only for documentary or literary/art-film tone:

- Background: `#F0EAD8`
- Ink: near black
- Accent: `#A87E5A`
- Key border: `#B12A1F`

Typography:

- Title: heavy grotesk style.
- Metadata and labels: narrow/light sans.
- Numbers, timecode, camera settings: mono style.
- Chinese body text: clear sans, left aligned.
- English technical terms: small caps or clear uppercase.

## Shot Vocabulary

Shot size must be one of:

`ESTABLISHING`, `WIDE`, `MED`, `MCU`, `CU`, `ECU`

Angle/position should be one of:

`eye level`, `High Angle`, `Low Angle`, `Dutch`, `OTS`, `POV`, `2-shot`

Movement should be one of:

`Static`, `Pan`, `Tilt`, `Dolly In`, `Dolly Out`, `Truck`, `Crane`, `Arc`, `Handheld`, `Steadicam`, `Whip Pan`, `Zoom`

Cut type should be one of:

`CUT`, `DISSOLVE`, `MATCH CUT`, `FADE TO BLACK`

Do not invent mixed labels such as `MS-CU`. Use only one shot size and one main movement in each shot.

## Continuity

- Keep screen direction stable unless a deliberate axis-crossing is explained.
- Keep the key-light direction stable in the same scene.
- Repeat character anchor traits in every image/video prompt.
- Keep props visually stable across rows.
- Frame thumbnails must match the text in the same row.
- Total shot durations must equal the footer `Total Runtime`.

## Key Shot

Choose one key shot at the turn or climax unless the user explicitly marks another shot. In data, set:

```json
{
  "key_shot": true,
  "key_shot_reason": "高潮转折镜头，角色首次做出关键选择"
}
```

In Markdown, add `★ KEY` to the row. In a rendered sheet image prompt, call for a thin red row outline and yellow key marker. Do not enlarge the whole table into a poster; keep it a working sheet.

## Rendered Sheet Image Prompt Pattern

When asked to create a prompt for rendering the sheet itself:

```text
Create a full-canvas industrial film Shot List Sheet, vertical multi-row seven-column table, no outer physical border, no clipboard, no paper texture, no tape, no desk, no shadow. Dark charcoal background #1A1A1C, thin #2A2A2D grid lines, dense production metadata header, columns: No., Frame, Timecode, Visual·Camera·Movement, Dialog·SFX, Cut·Shot Size·Movement, Camera Settings. Each row contains a small dark warm-gray cinematic storyboard thumbnail matching its shot text, mono timecodes, left-aligned Chinese body text, English technical shot terms, one yellow ★ KEY marker on the climax row, footer with total runtime and signature blanks. Functional production document, film unit call-sheet credibility, information dense, legible, no decorative icons, no comic speech bubbles.
```

