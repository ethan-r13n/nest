import { createContext, type ReactNode, useContext, useState } from 'react';

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

type WorkspaceSession = {
  draft: string;
  setDraft: (value: string) => void;
  assistantOpen: boolean;
  setAssistantOpen: (value: boolean) => void;
};

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <WorkspaceSessionContext.Provider value={{ draft, setDraft, assistantOpen, setAssistantOpen }}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error('Workspace session is unavailable');
  return session;
}
