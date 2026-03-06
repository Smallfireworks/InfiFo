import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Notebook } from './components/Notebook';
import { AIAssistant } from './components/AIAssistant';
import { BlockData, LayoutSettings, Note } from './types';
import { Menu } from 'lucide-react';

const mockNotes: Note[] = [
  {
    id: 'note-1',
    categoryId: 'math',
    title: 'Calculus & Limits',
    updatedAt: Date.now(),
    blocks: [
      { id: 'group-1', type: 'group', content: '1. Introduction', position: { x: 2400, y: 2450 }, size: { width: 600, height: 400 } },
      { id: 'block-1', type: 'markdown', content: '# What is a Limit?\n\nA limit is the value that a function approaches as the input approaches some value.\n\n$$ \\lim_{x \\to c} f(x) = L $$', position: { x: 2440, y: 2540 }, size: { width: 500, height: 150 } },
      { id: 'block-2', type: 'code', content: 'function calculateLimit(f, x, epsilon = 0.0001) {\n  return f(x + epsilon);\n}\n\nconst f = (x) => (x*x - 1) / (x - 1);\nconsole.log("Limit as x -> 1:", calculateLimit(f, 1));', position: { x: 2440, y: 2680 }, size: { width: 500, height: 150 } }
    ]
  },
  {
    id: 'note-2',
    categoryId: 'cs',
    title: 'React Hooks Deep Dive',
    updatedAt: Date.now() - 86400000,
    blocks: [
      { id: 'group-2', type: 'group', content: 'useEffect Mechanics', position: { x: 2400, y: 2450 }, size: { width: 600, height: 400 } },
      { id: 'block-3', type: 'markdown', content: '`useEffect` runs after the render is committed to the screen.', position: { x: 2440, y: 2540 }, size: { width: 500, height: 100 } }
    ]
  }
];

const LAYOUT_STORAGE_KEY = 'paper-notebook-layout-settings';
const MAX_HISTORY_PER_NOTE = 80;

interface NoteHistory {
  past: BlockData[][];
  future: BlockData[][];
}

function cloneBlocks(blocks: BlockData[]) {
  return JSON.parse(JSON.stringify(blocks)) as BlockData[];
}

function blocksEqual(a: BlockData[], b: BlockData[]) {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const defaultLayoutSettings: LayoutSettings = {
  organizeMode: 'stack',
  gap: 24,
  gridSize: 20,
  snapMode: 'smart',
  snapThreshold: 8,
  showBlockFrames: true,
  executionStepMs: 180
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>(mockNotes);
  const [activeNoteId, setActiveNoteId] = useState<string>(mockNotes[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [aiContext, setAiContext] = useState<{ text: string, type: 'block' | 'selection' } | null>(null);
  const [panToPosition, setPanToPosition] = useState<{x: number, y: number} | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const [fitRequestToken, setFitRequestToken] = useState(0);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(() => {
    if (typeof window === 'undefined') return defaultLayoutSettings;
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return defaultLayoutSettings;
      const parsed = JSON.parse(raw) as Partial<LayoutSettings>;
      return { ...defaultLayoutSettings, ...parsed };
    } catch {
      return defaultLayoutSettings;
    }
  });
  const historyRef = useRef<Record<string, NoteHistory>>({});

  const activeNote = notes.find(n => n.id === activeNoteId) || notes[0];

  const ensureNoteHistory = useCallback((noteId: string) => {
    if (!historyRef.current[noteId]) {
      historyRef.current[noteId] = { past: [], future: [] };
    }
    return historyRef.current[noteId];
  }, []);

  const handleBlockChange = (updatedBlocks: BlockData[]) => {
    setNotes((prev) => {
      const target = prev.find((n) => n.id === activeNoteId);
      if (!target) return prev;
      if (blocksEqual(target.blocks, updatedBlocks)) return prev;

      const history = ensureNoteHistory(activeNoteId);
      history.past.push(cloneBlocks(target.blocks));
      if (history.past.length > MAX_HISTORY_PER_NOTE) {
        history.past.splice(0, history.past.length - MAX_HISTORY_PER_NOTE);
      }
      history.future = [];

      return prev.map((n) => (
        n.id === activeNoteId ? { ...n, blocks: cloneBlocks(updatedBlocks), updatedAt: Date.now() } : n
      ));
    });
  };

  const handleUndo = useCallback(() => {
    if (!isOwner) return;
    setNotes((prev) => {
      const target = prev.find((n) => n.id === activeNoteId);
      if (!target) return prev;
      const history = ensureNoteHistory(activeNoteId);
      const previous = history.past.pop();
      if (!previous) return prev;
      history.future.push(cloneBlocks(target.blocks));
      if (history.future.length > MAX_HISTORY_PER_NOTE) {
        history.future.splice(0, history.future.length - MAX_HISTORY_PER_NOTE);
      }
      return prev.map((n) => (
        n.id === activeNoteId ? { ...n, blocks: cloneBlocks(previous), updatedAt: Date.now() } : n
      ));
    });
  }, [activeNoteId, ensureNoteHistory, isOwner]);

  const handleRedo = useCallback(() => {
    if (!isOwner) return;
    setNotes((prev) => {
      const target = prev.find((n) => n.id === activeNoteId);
      if (!target) return prev;
      const history = ensureNoteHistory(activeNoteId);
      const next = history.future.pop();
      if (!next) return prev;
      history.past.push(cloneBlocks(target.blocks));
      if (history.past.length > MAX_HISTORY_PER_NOTE) {
        history.past.splice(0, history.past.length - MAX_HISTORY_PER_NOTE);
      }
      return prev.map((n) => (
        n.id === activeNoteId ? { ...n, blocks: cloneBlocks(next), updatedAt: Date.now() } : n
      ));
    });
  }, [activeNoteId, ensureNoteHistory, isOwner]);

  const handleAIRequest = (text: string, type: 'block' | 'selection') => {
    setAiContext({ text, type });
    setAiSidebarOpen(true);
  };

  const handlePanTo = (x: number, y: number) => {
    setPanToPosition({ x, y });
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleFitCanvas = useCallback(() => {
    setFitRequestToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutSettings));
  }, [layoutSettings]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOwner) return;
      const target = event.target as HTMLElement | null;
      const isInputLike = Boolean(
        target &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
      );
      if (isInputLike) return;

      const commandKey = event.ctrlKey || event.metaKey;
      if (!commandKey) return;
      const key = event.key.toLowerCase();

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo, isOwner]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-paper)]">
      <button 
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-6 left-6 z-40 p-3 bg-[var(--color-paper)] border border-[var(--color-ink)]/10 rounded-xl shadow-sm hover:shadow-md transition-all text-[var(--color-ink)] ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <Menu size={24} />
      </button>

      <div className={`fixed inset-y-0 left-0 z-50 w-80 transform transition-transform duration-300 ease-in-out bg-[var(--color-paper)] border-r border-[var(--color-ink)]/10 shadow-2xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={setActiveNoteId}
          currentNoteBlocks={activeNote.blocks}
          onPanTo={handlePanTo}
          onClose={() => setSidebarOpen(false)} 
          isOwner={isOwner}
          onToggleOwner={() => setIsOwner(!isOwner)}
          onFitCanvas={handleFitCanvas}
          onUndo={handleUndo}
          onRedo={handleRedo}
          layoutSettings={layoutSettings}
          onLayoutSettingsChange={setLayoutSettings}
        />
      </div>

      <main className="flex-1 overflow-hidden relative">
        <Notebook 
          note={activeNote} 
          onChange={handleBlockChange} 
          onRequestAI={handleAIRequest}
          panToPosition={panToPosition}
          isOwner={isOwner}
          layoutSettings={layoutSettings}
          fitRequestToken={fitRequestToken}
        />
      </main>

      <div className={`fixed inset-y-0 right-0 z-50 w-96 transform transition-transform duration-300 ease-in-out bg-[var(--color-paper)] border-l border-[var(--color-ink)]/10 shadow-2xl ${aiSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <AIAssistant 
          context={aiContext} 
          onClose={() => setAiSidebarOpen(false)} 
        />
      </div>
      
      {sidebarOpen && <div className="fixed inset-0 bg-black/5 z-40" onClick={() => setSidebarOpen(false)} />}
      {aiSidebarOpen && <div className="fixed inset-0 bg-black/5 z-40" onClick={() => setAiSidebarOpen(false)} />}
    </div>
  );
}
