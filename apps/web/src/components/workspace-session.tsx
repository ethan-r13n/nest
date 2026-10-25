import { createContext, type ReactNode, useContext, useState } from 'react';

import { type AgentChat, useAgentChat } from '../lib/agent-chat.ts';

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

type WorkspaceSession = {
  draft: string;
  setDraft: (value: string) => void;
  assistantOpen: boolean;
  setAssistantOpen: (value: boolean) => void;
  /** One conversation shared by the assistant panel and the chat page. */
  chat: AgentChat;
};

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const chat = useAgentChat();
  return (
    <WorkspaceSessionContext.Provider value={{ draft, setDraft, assistantOpen, setAssistantOpen, chat }}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error('Workspace session is unavailable');
  return session;
}
