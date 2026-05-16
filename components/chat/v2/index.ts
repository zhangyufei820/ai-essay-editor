/**
 * 🖌 v2 chat 工作台总出口
 */

export { UserMessageV2 } from "./UserMessageV2"
export { AssistantMessageV2, type AssistantMessageV2Props } from "./AssistantMessageV2"
export { ChatComposerV2, type ChatComposerV2Props } from "./ChatComposerV2"
export { ChatWorkspaceV2, type ChatWorkspaceV2Props } from "./ChatWorkspaceV2"
export { ModelDrawerV2, type ModelDrawerV2Props } from "./ModelDrawerV2"
export {
  AGENT_REGISTRY,
  AGENT_GROUPS,
  getAgentByModel,
  listAgentsByGroup,
} from "./agent-registry"
export type * from "./types"
export * from "./templates"
