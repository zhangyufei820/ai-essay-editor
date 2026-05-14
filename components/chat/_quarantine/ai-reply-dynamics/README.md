# AI Reply Dynamics Quarantine

These files are intentionally isolated from the active chat UI.

Production baseline: commit `b0216a3`, deployed build `8fa52bce978f25a3`.

Reason:
- The active AI reply page must keep only `AssistantEyeAvatar` as the assistant-side SVG.
- The old reply-area loaders, workflow drawers, and animated icons repeatedly reappeared during UI work.
- Keeping them here preserves recoverability without letting normal imports pull them back into the chat reply UI.

The quarantined code is stored with `.tsx.quarantined` suffixes so it is not
compiled as active application code. Do not rename or import files from this
directory into `components/chat/enhanced-chat-interface.tsx` unless the product
decision explicitly changes.

Active files that remain in use:
- `components/chat/AssistantEyeAvatar.tsx`: the only assistant reply SVG/avatar currently allowed.
- `hooks/useWorkflowVisualizer.ts`: still used as a stream-state helper for cursor/fast-track state, but its visual components are disabled.
