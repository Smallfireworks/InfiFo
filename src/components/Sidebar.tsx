import React from 'react';
import { BookOpen, Map, X, FileText, Hash } from 'lucide-react';
import { Note, BlockData, LayoutSettings } from '../types';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string;
  onSelectNote: (id: string) => void;
  currentNoteBlocks: BlockData[];
  onPanTo: (x: number, y: number) => void;
  onClose: () => void;
  isOwner: boolean;
  onToggleOwner: () => void;
  onFitCanvas: () => void;
  onUndo: () => void;
  onRedo: () => void;
  layoutSettings: LayoutSettings;
  onLayoutSettingsChange: (settings: LayoutSettings) => void;
}

export function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  currentNoteBlocks,
  onPanTo,
  onClose,
  isOwner,
  onToggleOwner,
  onFitCanvas,
  onUndo,
  onRedo,
  layoutSettings,
  onLayoutSettingsChange
}: SidebarProps) {
  const areas = currentNoteBlocks.filter(b => b.type === 'group');

  const updateSettings = (updates: Partial<LayoutSettings>) => {
    onLayoutSettingsChange({ ...layoutSettings, ...updates });
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-hand text-3xl font-bold text-[var(--color-ink)]">Infinite Folio · InfiFo</h1>
        <button onClick={onClose} className="p-2 text-[var(--color-ink)]/60 hover:text-[var(--color-ink)] bg-[var(--color-ink)]/5 rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-mono font-bold text-[var(--color-ink-light)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <Map size={14} /> Current Canvas
        </h2>
        {areas.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-light)] italic">No areas defined yet. Right-click on canvas to add an Area.</p>
        ) : (
          <div className="space-y-1 border-l-2 border-[var(--color-ink)]/10 ml-2 pl-2">
            {areas.map(area => (
              <button
                key={area.id}
                onClick={() => onPanTo(area.position.x, area.position.y)}
                className="w-full text-left px-3 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5 rounded-lg transition-colors flex items-center gap-2"
              >
                <Hash size={14} className="opacity-50" />
                <span className="truncate">{area.content || 'Untitled Area'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1">
        <h2 className="text-xs font-mono font-bold text-[var(--color-ink-light)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen size={14} /> All Posts
        </h2>
        <div className="space-y-2">
          {notes.map(note => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${note.id === activeNoteId ? 'bg-[var(--color-ink)] text-[var(--color-paper)] shadow-md' : 'hover:bg-[var(--color-ink)]/5 text-[var(--color-ink)]'}`}
            >
              <FileText size={16} className={note.id === activeNoteId ? 'opacity-100' : 'opacity-60'} />
              <span className="font-medium truncate">{note.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-[var(--color-ink)]/10">
        <div className="space-y-3 px-4 py-4 bg-[var(--color-ink)]/5 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-ink)]">Mode</span>
            <button 
              onClick={onToggleOwner}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${isOwner ? 'bg-[var(--color-accent-blue)] text-white' : 'bg-[var(--color-ink)]/20 text-[var(--color-ink)]'}`}
            >
              {isOwner ? 'Owner' : 'Visitor'}
            </button>
          </div>
          <p className="text-xs text-[var(--color-ink-light)]">
            {isOwner ? 'Owner can edit, drag, run code, and connect blocks.' : 'Visitor is read-only and cannot modify blocks.'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onUndo}
              disabled={!isOwner}
              className="px-2 py-1.5 text-xs rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)] hover:bg-[var(--color-ink)]/5 disabled:opacity-60"
            >
              Undo
            </button>
            <button
              onClick={onRedo}
              disabled={!isOwner}
              className="px-2 py-1.5 text-xs rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)] hover:bg-[var(--color-ink)]/5 disabled:opacity-60"
            >
              Redo
            </button>
            <button
              onClick={onFitCanvas}
              className="px-2 py-1.5 text-xs rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)] hover:bg-[var(--color-ink)]/5"
            >
              Fit View
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 mt-3 bg-[var(--color-ink)]/5 rounded-xl">
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Layout Rules</h3>
          <label className="block">
            <span className="text-xs text-[var(--color-ink-light)]">Organize Mode</span>
            <select
              value={layoutSettings.organizeMode}
              onChange={(e) => updateSettings({ organizeMode: e.target.value as LayoutSettings['organizeMode'] })}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] disabled:opacity-60"
            >
              <option value="stack">Stack</option>
              <option value="grid">Grid</option>
              <option value="waterfall">Waterfall</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-[var(--color-ink-light)]">Drag Snap</span>
            <select
              value={layoutSettings.snapMode}
              onChange={(e) => updateSettings({ snapMode: e.target.value as LayoutSettings['snapMode'] })}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] disabled:opacity-60"
            >
              <option value="off">Off</option>
              <option value="grid">Grid Snap</option>
              <option value="smart">Smart Guides</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-[var(--color-ink-light)]">Gap</span>
              <input
                type="number"
                min={8}
                max={80}
                value={layoutSettings.gap}
                onChange={(e) => updateSettings({ gap: Number(e.target.value) || 24 })}
                disabled={!isOwner}
                className="mt-1 w-full rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--color-ink-light)]">Grid</span>
              <input
                type="number"
                min={8}
                max={80}
                value={layoutSettings.gridSize}
                onChange={(e) => updateSettings({ gridSize: Number(e.target.value) || 20 })}
                disabled={!isOwner}
                className="mt-1 w-full rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-[var(--color-ink-light)]">Snap Threshold</span>
            <input
              type="number"
              min={2}
              max={30}
              value={layoutSettings.snapThreshold}
              onChange={(e) => updateSettings({ snapThreshold: Number(e.target.value) || 8 })}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-xs text-[var(--color-ink-light)]">Code Step Speed (ms)</span>
            <input
              type="range"
              min={60}
              max={1200}
              step={20}
              value={layoutSettings.executionStepMs}
              onChange={(e) => updateSettings({ executionStepMs: Number(e.target.value) || 180 })}
              disabled={!isOwner}
              className="mt-2 w-full disabled:opacity-60"
            />
            <div className="mt-1 text-[11px] text-[var(--color-ink-light)]">
              {layoutSettings.executionStepMs} ms per block
            </div>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-ink)]/12 px-2 py-2">
            <span className="text-xs text-[var(--color-ink-light)]">Show Block Frames</span>
            <button
              onClick={() => updateSettings({ showBlockFrames: !layoutSettings.showBlockFrames })}
              disabled={!isOwner}
              className={`px-2 py-1 text-xs rounded-md transition-colors disabled:opacity-60 ${layoutSettings.showBlockFrames ? 'bg-[var(--color-accent-blue)] text-white' : 'bg-[var(--color-ink)]/15 text-[var(--color-ink)]'}`}
            >
              {layoutSettings.showBlockFrames ? 'On' : 'Off'}
            </button>
          </label>

          <p className="text-xs text-[var(--color-ink-light)]">
            These rules are saved locally. In `stack` mode, organize will auto switch to multi-column when an area has 4+ blocks and enough width.
          </p>
        </div>
      </div>
    </div>
  );
}
