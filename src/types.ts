export type BlockType = 'markdown' | 'code' | 'group' | 'image' | 'music' | 'draw' | 'graph';

export type OrganizeMode = 'stack' | 'grid' | 'waterfall';

export type SnapMode = 'off' | 'grid' | 'smart';

export interface LayoutSettings {
  organizeMode: OrganizeMode;
  gap: number;
  gridSize: number;
  snapMode: SnapMode;
  snapThreshold: number;
  showBlockFrames: boolean;
  executionStepMs: number;
}

export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  output?: string;
  error?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  locked?: boolean;
  parentId?: string;
  connections?: string[];
  meta?: Record<string, unknown>;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface Note {
  id: string;
  categoryId: string;
  title: string;
  blocks: BlockData[];
  updatedAt: number;
}
