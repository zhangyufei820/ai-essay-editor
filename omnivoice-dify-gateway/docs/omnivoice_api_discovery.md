# OmniVoice API Discovery

Discovery date: 2026-05-18

Source inspected: `vendor/OmniVoice-Studio` cloned from `https://github.com/debpalash/OmniVoice-Studio`.

## Confirmed Runtime

- Backend framework: FastAPI.
- Default backend port: `3900`.
- Docker image: `ghcr.io/debpalash/omnivoice-studio:latest`.
- Official Docker compose binds `127.0.0.1:3900:3900` and warns that OmniVoice ships no authentication.
- The gateway must not expose OmniVoice directly to the public internet.

## Confirmed Routes Relevant To This Gateway

### Health

- `GET /health`
- Implemented in `backend/main.py`.
- Used by gateway `GET /healthz` to report upstream status.

### OpenAI-Compatible TTS

- `POST /v1/audio/speech`
- Implemented in `backend/api/routers/openai_compat.py`.
- JSON body:
  - `model`: `omnivoice`, `tts-1`, `tts-1-hd`, or engine IDs such as `voxcpm2`, `cosyvoice`, `kittentts`.
  - `input`: text, max length 4096 in upstream schema.
  - `voice`: `default`, OpenAI aliases, voice profile IDs, or some engine preset names.
  - `response_format`: `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm`.
  - `speed`: 0.25 to 4.0.
  - Optional `language`, `description`, `instruct`.
- Response: binary audio stream with content type and inline filename.
- Gateway uses this as primary TTS adapter when present and stores the returned bytes under `MEDIA_DIR`.
- Runtime note from production deployment on 2026-05-18: the inspected source contains this route, but the pulled `ghcr.io/debpalash/omnivoice-studio:latest` image returned `405 Method Not Allowed` for `POST /v1/audio/speech` and `404` for `GET /v1/audio/voices`. The gateway therefore falls back to native `POST /generate` when the OpenAI-compatible route is absent in the running image.
- The running OmniVoice image rejects generic style values such as `friendly` and language values such as `zh-CN`. The gateway maps `zh-CN` to `zh` and maps teacher aliases to supported Chinese instruct values such as `女，青年，中音调` or `男，青年，中音调`.

### OpenAI-Compatible Voice List

- `GET /v1/audio/voices`
- Implemented in `backend/api/routers/openai_compat.py`.
- Response shape: `{ "voices": [...], "engines": [...] }`.
- Includes OpenAI alias voices and user-created voice profiles.
- Gateway only exposes `ALLOWED_VOICE_IDS`.

### Native Generate

- `POST /generate`
- Implemented in `backend/api/routers/generation.py`.
- Form/multipart route with fields such as `text`, `language`, `ref_audio`, `ref_text`, `instruct`, `duration`, `num_step`, `guidance_scale`, `speed`, `profile_id`, `seed`.
- Response: binary WAV stream with headers `X-Audio-Id`, `X-Audio-Path`, `X-Audio-Duration`.
- The gateway uses this as a fallback when `/v1/audio/speech` is not available in the running image.

### Voice Profiles / Clone-Adjacent API

- `GET /profiles`
- `POST /profiles`
- `GET /profiles/{profile_id}`
- `PUT /profiles/{profile_id}`
- `GET /profiles/{profile_id}/audio`
- `POST /profiles/{profile_id}/lock`
- `POST /profiles/{profile_id}/unlock`
- `DELETE /profiles/{profile_id}`
- Implemented in `backend/api/routers/profiles.py`.
- `POST /profiles` accepts multipart `name`, `ref_audio`, `ref_text`, `instruct`, `language`, `seed`, `personality` and returns `{ "id": "...", "name": "..." }`.
- Gateway maps restricted voice clone to `POST /profiles` only when `ENABLE_VOICE_CLONE=true`, consent is confirmed, and audit logging succeeds.
- New cloned profile IDs are not automatically added to `ALLOWED_VOICE_IDS`.

### Jobs And Dubbing

- `GET /jobs`
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/events`
- `POST /dub/generate/{job_id}`
- `GET /dub/download*`, `/dub/audio*`, `/dub/media*`, `/dub/srt*`, etc.
- These are oriented around OmniVoice dubbing projects, not simple Dify TTS.
- Gateway implements its own lightweight job queue for Dify TTS requests instead of proxying OmniVoice dub jobs.

## Other Routes Found

The backend also includes routes for batch jobs, engines, setup/model installation, gallery voices, transcriptions, watermarks, tools, project state, glossary, export history, WebSockets, and marketplace. They are not exposed by this gateway.

## Gateway Adapter Decision

Primary adapter:

- `GET /health` for upstream readiness.
- `GET /v1/audio/voices` for upstream visibility.
- `POST /v1/audio/speech` for TTS when present.
- Fallback to `POST /generate` for TTS when the running OmniVoice image does not include the OpenAI-compatible route.
- `POST /profiles` for restricted clone creation only when explicitly enabled.

Reasons:

- `/v1/audio/speech` returns binary audio directly, so the gateway can store it and return JSON with `audio_url`.
- `/generate` also returns binary audio and is reliable in the current container image, though it is a form/multipart native API rather than OpenAI-compatible JSON.
- It supports standard OpenAI-style request semantics, which are easier to adapt to Dify.

Known limitation:

- The platform voice IDs `teacher_female_01` and `teacher_male_01` are gateway-level business aliases and currently map to upstream `default`. To use real branded teacher profiles, create OmniVoice profiles, then add their upstream IDs to `ALLOWED_VOICE_IDS` or extend the alias map in `app/omnivoice_client.py`.
