import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockData, BlockType, LayoutSettings, Note } from '../types';
import { Block } from './Block';
import { Type, Code as CodeIcon, Square, Image as ImageIcon, Music, PenTool, LineChart, type LucideIcon } from 'lucide-react';
import {
  canExecuteInBrowser,
  getCodeBackendHint,
  getCodeLanguageLabel,
  normalizeCodeLanguage
} from '../services/codeLanguage';

interface NotebookProps {
  note: Note;
  onChange: (blocks: BlockData[]) => void;
  onRequestAI: (text: string, type: 'block' | 'selection') => void;
  panToPosition: {x: number, y: number} | null;
  isOwner: boolean;
  layoutSettings: LayoutSettings;
  fitRequestToken: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

interface BlockSize {
  width: number;
  height: number;
}

interface GuideState {
  x: number | null;
  y: number | null;
}

interface ConnectionLine {
  key: string;
  path: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

interface BlockTemplate {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  defaultContent: string;
  defaultSize: BlockSize;
}

const BLOCK_LIBRARY: BlockTemplate[] = [
  {
    type: 'markdown',
    label: 'Add Text',
    icon: Type,
    defaultContent: '',
    defaultSize: { width: 450, height: 180 }
  },
  {
    type: 'code',
    label: 'Add Code',
    icon: CodeIcon,
    defaultContent: '// Write some code here...',
    defaultSize: { width: 500, height: 240 }
  },
  {
    type: 'image',
    label: 'Add Image',
    icon: ImageIcon,
    defaultContent: '',
    defaultSize: { width: 420, height: 280 }
  },
  {
    type: 'music',
    label: 'Add Music',
    icon: Music,
    defaultContent: '',
    defaultSize: { width: 420, height: 220 }
  },
  {
    type: 'draw',
    label: 'Add Drawing',
    icon: PenTool,
    defaultContent: '',
    defaultSize: { width: 460, height: 320 }
  },
  {
    type: 'graph',
    label: 'Add Graph',
    icon: LineChart,
    defaultContent: 'sin(x)\n0.2*x^2 - 1',
    defaultSize: { width: 560, height: 360 }
  },
  {
    type: 'group',
    label: 'Add Area',
    icon: Square,
    defaultContent: 'New Area',
    defaultSize: { width: 600, height: 400 }
  }
];

const CANVAS_SIZE = 5000;
const CANVAS_HALF = CANVAS_SIZE / 2;
const MIN_CANVAS_SCALE = 0.45;
const MAX_CANVAS_SCALE = 1.9;

function getFallbackSize(block: BlockData): BlockSize {
  if (block.size) return block.size;
  switch (block.type) {
    case 'group':
      return { width: 600, height: 400 };
    case 'draw':
      return { width: 460, height: 320 };
    case 'graph':
      return { width: 560, height: 360 };
    case 'code':
      return { width: 500, height: 240 };
    case 'image':
      return { width: 420, height: 280 };
    case 'music':
      return { width: 420, height: 220 };
    default:
      return { width: 450, height: 180 };
  }
}

function getBlockLayer(block: BlockData, fallback: number) {
  const value = block.meta?.zIndex;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isDescendantOf(block: BlockData, ancestorId: string, blockMap: Map<string, BlockData>) {
  let cursor = block.parentId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = blockMap.get(cursor)?.parentId;
  }
  return false;
}

function isAncestorOf(candidateId: string, targetId: string, blockMap: Map<string, BlockData>) {
  let cursor = blockMap.get(targetId)?.parentId;
  while (cursor) {
    if (cursor === candidateId) return true;
    cursor = blockMap.get(cursor)?.parentId;
  }
  return false;
}

export function Notebook({ note, onChange, onRequestAI, panToPosition, isOwner, layoutSettings, fitRequestToken }: NotebookProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomShellRef = useRef<HTMLDivElement>(null);
  const canvasBgRef = useRef<HTMLDivElement>(null);
  const canvasScaleRef = useRef(1);
  const wheelZoomRef = useRef<{ deltaY: number; pointerX: number; pointerY: number } | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [dragGuides, setDragGuides] = useState<GuideState>({ x: null, y: null });
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<{ groupId: string; dx: number; dy: number } | null>(null);
  const [runningCodeChain, setRunningCodeChain] = useState<string[]>([]);
  const [activeRunningCodeId, setActiveRunningCodeId] = useState<string | null>(null);
  const [breakpointHitId, setBreakpointHitId] = useState<string | null>(null);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const applyCanvasScale = useCallback((scale: number) => {
    if (zoomShellRef.current) {
      zoomShellRef.current.style.width = `${CANVAS_SIZE * scale}px`;
      zoomShellRef.current.style.height = `${CANVAS_SIZE * scale}px`;
    }
    if (canvasBgRef.current) {
      const style = canvasBgRef.current.style as CSSStyleDeclaration & { zoom?: string };
      if (typeof style.zoom !== 'undefined') {
        style.zoom = String(scale);
        canvasBgRef.current.style.transform = 'scale(1)';
      } else {
        canvasBgRef.current.style.transform = `scale(${scale})`;
      }
    }
  }, []);

  useEffect(() => {
    applyCanvasScale(canvasScaleRef.current);
  }, [applyCanvasScale]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = CANVAS_HALF * canvasScaleRef.current - containerRef.current.clientWidth / 2;
      containerRef.current.scrollTop = CANVAS_HALF * canvasScaleRef.current - containerRef.current.clientHeight / 2;
    }
  }, []);

  useEffect(() => {
    if (panToPosition && containerRef.current) {
      const scale = canvasScaleRef.current;
      containerRef.current.scrollTo({
        left: panToPosition.x * scale - containerRef.current.clientWidth / 2 + 300,
        top: panToPosition.y * scale - containerRef.current.clientHeight / 2 + 200,
        behavior: 'smooth'
      });
    }
  }, [panToPosition]);

  useEffect(() => {
    if (!containerRef.current || fitRequestToken <= 0) return;
    if (note.blocks.length === 0) {
      canvasScaleRef.current = 1;
      applyCanvasScale(1);
      containerRef.current.scrollLeft = CANVAS_HALF - containerRef.current.clientWidth / 2;
      containerRef.current.scrollTop = CANVAS_HALF - containerRef.current.clientHeight / 2;
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const block of note.blocks) {
      const size = getFallbackSize(block);
      minX = Math.min(minX, block.position.x);
      minY = Math.min(minY, block.position.y);
      maxX = Math.max(maxX, block.position.x + size.width);
      maxY = Math.max(maxY, block.position.y + size.height);
    }

    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const padding = 120;
    const targetScale = Math.min(
      MAX_CANVAS_SCALE,
      Math.max(
        MIN_CANVAS_SCALE,
        Math.min(
          containerRef.current.clientWidth / (contentWidth + padding * 2),
          containerRef.current.clientHeight / (contentHeight + padding * 2)
        )
      )
    );

    canvasScaleRef.current = targetScale;
    applyCanvasScale(targetScale);
    const centerX = minX + contentWidth / 2;
    const centerY = minY + contentHeight / 2;
    containerRef.current.scrollLeft = centerX * targetScale - containerRef.current.clientWidth / 2;
    containerRef.current.scrollTop = centerY * targetScale - containerRef.current.clientHeight / 2;
  }, [applyCanvasScale, fitRequestToken, note.blocks]);

  useEffect(() => {
    if (!isOwner) {
      setContextMenu(null);
      setConnectingFromId(null);
      setDragGuides({ x: null, y: null });
      setGroupDragPreview(null);
      setRunningCodeChain([]);
      setActiveRunningCodeId(null);
      setBreakpointHitId(null);
    }
  }, [isOwner]);

  useEffect(() => {
    setGroupDragPreview(null);
    setRunningCodeChain([]);
    setActiveRunningCodeId(null);
    setBreakpointHitId(null);
  }, [note.id]);

  const getBlockSize = useCallback((block: BlockData): BlockSize => {
    const element = document.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement | null;
    if (element) {
      return { width: element.offsetWidth, height: element.offsetHeight };
    }
    return getFallbackSize(block);
  }, []);

  const setGuideState = useCallback((next: GuideState) => {
    setDragGuides((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
  }, []);

  const getNextLayer = useCallback((blocks: BlockData[]) => {
    const maxLayer = blocks.reduce((max, item, index) => (
      Math.max(max, getBlockLayer(item, index))
    ), 0);
    return maxLayer + 1;
  }, []);

  const blockMap = useMemo(
    () => new Map(note.blocks.map((item) => [item.id, item])),
    [note.blocks]
  );

  const handleGroupDragPreview = useCallback((groupId: string, nextPosition: { x: number; y: number }) => {
    const group = blockMap.get(groupId);
    if (!group || group.type !== 'group') return;
    const dx = nextPosition.x - group.position.x;
    const dy = nextPosition.y - group.position.y;
    setGroupDragPreview((prev) => {
      if (!prev && dx === 0 && dy === 0) return prev;
      if (prev && prev.groupId === groupId && prev.dx === dx && prev.dy === dy) return prev;
      return { groupId, dx, dy };
    });
  }, [blockMap]);

  const clearGroupDragPreview = useCallback((groupId: string) => {
    setGroupDragPreview((prev) => (prev?.groupId === groupId ? null : prev));
  }, []);

  const getBlockPreviewOffset = useCallback((block: BlockData) => {
    if (!groupDragPreview) return null;
    if (block.id === groupDragPreview.groupId) return null;
    if (!isDescendantOf(block, groupDragPreview.groupId, blockMap)) return null;
    return { x: groupDragPreview.dx, y: groupDragPreview.dy };
  }, [blockMap, groupDragPreview]);

  const getRenderedPosition = useCallback((block: BlockData) => {
    const offset = getBlockPreviewOffset(block);
    if (!offset) return block.position;
    return {
      x: block.position.x + offset.x,
      y: block.position.y + offset.y
    };
  }, [getBlockPreviewOffset]);

  const isCanvasBackgroundTarget = (target: HTMLElement | null) => {
    if (!target) return false;
    if (target === containerRef.current) return true;
    return target.id === 'canvas-bg' || target.id === 'canvas-zoom-shell';
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    if (isCanvasBackgroundTarget(e.target as HTMLElement | null)) {
      const rect = containerRef.current!.getBoundingClientRect();
      const scale = canvasScaleRef.current;
      setContextMenu({
        x: (e.clientX - rect.left + containerRef.current!.scrollLeft) / scale,
        y: (e.clientY - rect.top + containerRef.current!.scrollTop) / scale,
        clientX: e.clientX,
        clientY: e.clientY
      });
    } else {
      setContextMenu(null);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && isCanvasBackgroundTarget(e.target as HTMLElement | null)) {
      window.getSelection()?.removeAllRanges();
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.hover-scroll')) return;
    if (!containerRef.current) return;

    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const pixelDelta = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * 120 : e.deltaY);
    const previous = wheelZoomRef.current;
    wheelZoomRef.current = {
      deltaY: (previous?.deltaY || 0) + pixelDelta,
      pointerX,
      pointerY
    };

    if (wheelRafRef.current !== null) return;
    wheelRafRef.current = window.requestAnimationFrame(() => {
      wheelRafRef.current = null;
      const intent = wheelZoomRef.current;
      wheelZoomRef.current = null;
      if (!intent || !containerRef.current) return;

      const previousScale = canvasScaleRef.current;
      const wheelFactor = Math.exp(-intent.deltaY * 0.0012);
      const nextScale = Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, previousScale * wheelFactor));
      if (Math.abs(nextScale - previousScale) < 0.0001) return;

      const worldX = (containerRef.current.scrollLeft + intent.pointerX) / previousScale;
      const worldY = (containerRef.current.scrollTop + intent.pointerY) / previousScale;
      canvasScaleRef.current = nextScale;
      applyCanvasScale(nextScale);
      containerRef.current.scrollLeft = worldX * nextScale - intent.pointerX;
      containerRef.current.scrollTop = worldY * nextScale - intent.pointerY;
    });
  };

  useEffect(() => () => {
    if (wheelRafRef.current !== null) {
      window.cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning && containerRef.current) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      containerRef.current.scrollLeft -= dx;
      containerRef.current.scrollTop -= dy;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
    }
  };

  const addBlock = (type: BlockType) => {
    if (!contextMenu || !isOwner) return;
    const template = BLOCK_LIBRARY.find((item) => item.type === type);
    if (!template) return;
    const nextLayer = getNextLayer(note.blocks);
    const newBlock: BlockData = {
      id: `block-${Date.now()}`,
      type,
      content: template.defaultContent,
      position: { x: contextMenu.x, y: contextMenu.y },
      size: template.defaultSize,
      meta: { zIndex: nextLayer }
    };
    onChange([...note.blocks, newBlock]);
    closeContextMenu();
  };

  const bringBlockToFront = (blockId: string) => {
    if (!isOwner) return;
    const target = note.blocks.find((item) => item.id === blockId);
    if (!target || target.type === 'group') return;
    const nextLayer = getNextLayer(note.blocks);
    const currentLayer = getBlockLayer(target, 0);
    if (currentLayer >= nextLayer - 1) return;

    const nextBlocks = note.blocks.map((item) => (
      item.id === blockId
        ? {
            ...item,
            meta: {
              ...(item.meta || {}),
              zIndex: nextLayer
            }
          }
        : item
    ));
    onChange(nextBlocks);
  };

  const updateBlock = (id: string, updates: Partial<BlockData>) => {
    if (!isOwner) return;
    const block = note.blocks.find((item) => item.id === id);
    if (!block) return;
    if (block.locked && block.type !== 'group' && updates.position) return;

    let newBlocks = [...note.blocks];

    if (block.type === 'group' && updates.position) {
      const dx = updates.position.x - block.position.x;
      const dy = updates.position.y - block.position.y;
      const blockMap = new Map(newBlocks.map((item) => [item.id, item]));
      newBlocks = newBlocks.map((item) => {
        if (item.id !== id && isDescendantOf(item, id, blockMap)) {
          return { ...item, position: { x: item.position.x + dx, y: item.position.y + dy } };
        }
        return item;
      });
    }

    newBlocks = newBlocks.map((item) => (item.id === id ? { ...item, ...updates } : item));
    onChange(newBlocks);
  };

  const deleteBlock = (id: string) => {
    if (!isOwner) return;
    const blockMap = new Map(note.blocks.map((item) => [item.id, item]));
    const descendantIds = new Set(
      note.blocks.filter((item) => isDescendantOf(item, id, blockMap)).map((item) => item.id)
    );
    const nextBlocks = note.blocks
      .filter((item) => item.id !== id)
      .map((item) => {
        const nextConnections = item.connections?.filter((targetId) => targetId !== id);
        if (descendantIds.has(item.id)) {
          return { ...item, parentId: undefined, locked: false, connections: nextConnections };
        }
        if (!nextConnections || nextConnections.length === item.connections?.length) {
          return item;
        }
        return { ...item, connections: nextConnections };
      });
    onChange(nextBlocks);
    if (connectingFromId === id) {
      setConnectingFromId(null);
    }
  };

  const resolveDragPosition = useCallback((blockId: string, rawPosition: { x: number; y: number }, phase: 'move' | 'end') => {
    if (!isOwner || layoutSettings.snapMode === 'off') {
      if (phase === 'move') {
        setGuideState({ x: null, y: null });
      } else {
        setGuideState({ x: null, y: null });
      }
      return rawPosition;
    }

    const currentBlock = note.blocks.find((item) => item.id === blockId);
    if (!currentBlock) return rawPosition;

    const threshold = Math.max(2, layoutSettings.snapThreshold);
    const currentSize = getBlockSize(currentBlock);
    const startX = rawPosition.x;
    const startY = rawPosition.y;
    let snappedX = startX;
    let snappedY = startY;
    let guideX: number | null = null;
    let guideY: number | null = null;

    if (layoutSettings.snapMode === 'grid' || layoutSettings.snapMode === 'smart') {
      const grid = Math.max(8, layoutSettings.gridSize);
      const gridX = Math.round(startX / grid) * grid;
      const gridY = Math.round(startY / grid) * grid;
      if (Math.abs(gridX - startX) <= threshold) {
        snappedX = gridX;
        guideX = gridX;
      }
      if (Math.abs(gridY - startY) <= threshold) {
        snappedY = gridY;
        guideY = gridY;
      }
    }

    if (layoutSettings.snapMode === 'smart') {
      let bestDiffX = guideX === null ? Number.POSITIVE_INFINITY : Math.abs(guideX - startX);
      let bestDiffY = guideY === null ? Number.POSITIVE_INFINITY : Math.abs(guideY - startY);
      let bestSnapX = snappedX;
      let bestSnapY = snappedY;
      let bestGuideX = guideX;
      let bestGuideY = guideY;

      for (const other of note.blocks) {
        if (other.id === blockId) continue;
        const otherSize = getBlockSize(other);

        const xTargets = [
          { snap: other.position.x, guide: other.position.x },
          { snap: other.position.x + otherSize.width / 2 - currentSize.width / 2, guide: other.position.x + otherSize.width / 2 }
        ];
        const yTargets = [
          { snap: other.position.y, guide: other.position.y },
          { snap: other.position.y + otherSize.height / 2 - currentSize.height / 2, guide: other.position.y + otherSize.height / 2 }
        ];

        for (const target of xTargets) {
          const diff = Math.abs(target.snap - startX);
          if (diff <= threshold && diff < bestDiffX) {
            bestDiffX = diff;
            bestSnapX = target.snap;
            bestGuideX = target.guide;
          }
        }
        for (const target of yTargets) {
          const diff = Math.abs(target.snap - startY);
          if (diff <= threshold && diff < bestDiffY) {
            bestDiffY = diff;
            bestSnapY = target.snap;
            bestGuideY = target.guide;
          }
        }
      }

      snappedX = bestSnapX;
      snappedY = bestSnapY;
      guideX = bestGuideX;
      guideY = bestGuideY;
    }

    if (phase === 'move') {
      setGuideState({ x: guideX, y: guideY });
    } else {
      setGuideState({ x: null, y: null });
    }

    return { x: snappedX, y: snappedY };
  }, [
    getBlockSize,
    isOwner,
    layoutSettings.gridSize,
    layoutSettings.snapMode,
    layoutSettings.snapThreshold,
    note.blocks,
    setGuideState
  ]);

  const organizeGroup = (groupId: string) => {
    if (!isOwner) return;
    const group = note.blocks.find((item) => item.id === groupId);
    if (!group || group.type !== 'group') return;

    const groupX = group.position.x;
    const groupY = group.position.y;
    const groupW = group.size?.width || 600;
    const groupH = group.size?.height || 400;
    const gap = Math.max(8, layoutSettings.gap);
    const paddingX = 24;
    const paddingTop = 80;
    const blockMap = new Map(note.blocks.map((item) => [item.id, item]));

    const candidates = note.blocks
      .filter((item) => {
        if (item.id === groupId) return false;
        if (isAncestorOf(item.id, groupId, blockMap)) return false;
        const { width, height } = getBlockSize(item);
        const centerX = item.position.x + width / 2;
        const centerY = item.position.y + height / 2;
        return centerX >= groupX && centerX <= groupX + groupW && centerY >= groupY && centerY <= groupY + groupH;
      });
    const candidateIds = new Set(candidates.map((item) => item.id));
    const children = candidates
      .filter((item) => {
        let parentId = item.parentId;
        while (parentId) {
          if (parentId === groupId) return true;
          if (candidateIds.has(parentId)) return false;
          parentId = blockMap.get(parentId)?.parentId;
        }
        return true;
      })
      .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));

    if (children.length === 0) return;

    const measuredChildren = children.map((item) => ({ item, ...getBlockSize(item) }));
    const updates = new Map<string, { x: number; y: number }>();
    const sizeUpdates = new Map<string, BlockSize>();
    const enableAutoColumns = layoutSettings.organizeMode === 'stack' && children.length >= 4 && groupW >= 520;
    const effectiveMode = enableAutoColumns ? 'grid' : layoutSettings.organizeMode;

    let maxRight = groupX + paddingX;
    let maxBottom = groupY + paddingTop;

    if (effectiveMode === 'grid') {
      const availableWidth = Math.max(160, groupW - paddingX * 2);
      const baseMinWidth = 260;
      const maxColumnsByWidth = Math.max(1, Math.floor((availableWidth + gap) / (baseMinWidth + gap)));
      const columnCount = Math.max(1, Math.min(measuredChildren.length, maxColumnsByWidth));
      const columnWidth = Math.max(200, Math.floor((availableWidth - (columnCount - 1) * gap) / columnCount));
      let col = 0;
      let rowTop = groupY + paddingTop;
      let rowHeight = 0;

      for (const child of measuredChildren) {
        const x = groupX + paddingX + col * (columnWidth + gap);
        const y = rowTop;
        if (child.item.type !== 'group') {
          sizeUpdates.set(child.item.id, {
            width: columnWidth,
            height: child.item.size?.height || child.height
          });
        }
        const effectiveWidth = child.item.type !== 'group' ? columnWidth : child.width;
        updates.set(child.item.id, { x, y });
        maxRight = Math.max(maxRight, x + effectiveWidth);
        maxBottom = Math.max(maxBottom, y + child.height);
        rowHeight = Math.max(rowHeight, child.height);
        col += 1;
        if (col >= columnCount) {
          col = 0;
          rowTop += rowHeight + gap;
          rowHeight = 0;
        }
      }
    } else if (effectiveMode === 'waterfall') {
      const availableWidth = Math.max(160, groupW - paddingX * 2);
      const baseMinWidth = 240;
      const maxColumnsByWidth = Math.max(1, Math.floor((availableWidth + gap) / (baseMinWidth + gap)));
      const columnCount = Math.max(1, Math.min(measuredChildren.length, maxColumnsByWidth));
      const laneWidth = Math.max(200, Math.floor((availableWidth - (columnCount - 1) * gap) / columnCount));
      const columnHeights = Array.from({ length: columnCount }, () => groupY + paddingTop);

      for (const child of measuredChildren) {
        let columnIndex = 0;
        let minimumY = columnHeights[0];
        for (let i = 1; i < columnHeights.length; i += 1) {
          if (columnHeights[i] < minimumY) {
            minimumY = columnHeights[i];
            columnIndex = i;
          }
        }
        const x = groupX + paddingX + columnIndex * (laneWidth + gap);
        const y = minimumY;
        if (child.item.type !== 'group') {
          sizeUpdates.set(child.item.id, {
            width: laneWidth,
            height: child.item.size?.height || child.height
          });
        }
        const effectiveWidth = child.item.type !== 'group' ? laneWidth : child.width;
        updates.set(child.item.id, { x, y });
        columnHeights[columnIndex] = y + child.height + gap;
        maxRight = Math.max(maxRight, x + effectiveWidth);
        maxBottom = Math.max(maxBottom, y + child.height);
      }
    } else {
      const startX = groupX + paddingX;
      let currentY = groupY + paddingTop;
      for (const child of measuredChildren) {
        updates.set(child.item.id, { x: startX, y: currentY });
        maxRight = Math.max(maxRight, startX + child.width);
        maxBottom = Math.max(maxBottom, currentY + child.height);
        currentY += child.height + gap;
      }
    }

    const requiredWidth = Math.max(groupW, maxRight - groupX + paddingX);
    const requiredHeight = Math.max(groupH, maxBottom - groupY + gap + 24);

    const groupShift = new Map<string, { dx: number; dy: number }>();
    for (const child of measuredChildren) {
      if (child.item.type !== 'group') continue;
      const nextPos = updates.get(child.item.id);
      if (!nextPos) continue;
      groupShift.set(child.item.id, {
        dx: nextPos.x - child.item.position.x,
        dy: nextPos.y - child.item.position.y
      });
    }

    const newBlocks = note.blocks.map((item) => {
      if (item.id === groupId) {
        return {
          ...item,
          size: {
            width: Math.ceil(requiredWidth),
            height: Math.ceil(requiredHeight)
          }
        };
      }
      const position = updates.get(item.id);
      if (position) {
        const nextSize = sizeUpdates.get(item.id);
        const isNestedGroup = item.type === 'group';
        return {
          ...item,
          position,
          size: nextSize ? { ...item.size, ...nextSize } : item.size,
          parentId: groupId,
          locked: isNestedGroup ? false : true
        };
      }
      let shiftX = 0;
      let shiftY = 0;
      let cursor = item.parentId;
      while (cursor) {
        const shift = groupShift.get(cursor);
        if (shift) {
          shiftX += shift.dx;
          shiftY += shift.dy;
        }
        cursor = blockMap.get(cursor)?.parentId;
      }
      if (shiftX !== 0 || shiftY !== 0) {
        return {
          ...item,
          position: {
            x: item.position.x + shiftX,
            y: item.position.y + shiftY
          }
        };
      }
      return item;
    });

    onChange(newBlocks);
  };

  const handleConnectionAction = (blockId: string) => {
    if (!isOwner) return;
    const block = note.blocks.find((item) => item.id === blockId);
    if (!block || block.type === 'group') return;

    if (!connectingFromId) {
      setConnectingFromId(blockId);
      return;
    }

    if (connectingFromId === blockId) {
      setConnectingFromId(null);
      return;
    }

    const source = note.blocks.find((item) => item.id === connectingFromId);
    if (!source) {
      setConnectingFromId(blockId);
      return;
    }

    const existing = source.connections || [];
    const alreadyLinked = existing.includes(blockId);
    const nextConnections = alreadyLinked
      ? existing.filter((id) => id !== blockId)
      : [...existing, blockId];

    const nextBlocks = note.blocks.map((item) => (
      item.id === connectingFromId ? { ...item, connections: nextConnections } : item
    ));
    onChange(nextBlocks);
    setConnectingFromId(null);
  };

  const codeGraph = useMemo(() => {
    const codeBlocks = note.blocks.filter((item) => item.type === 'code');
    const codeById = new Map(codeBlocks.map((item) => [item.id, item]));
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    const undirected = new Map<string, Set<string>>();
    const breakpointMap = new Map<string, boolean>();
    const languageMap = new Map<string, ReturnType<typeof normalizeCodeLanguage>>();

    for (const block of codeBlocks) {
      outgoing.set(block.id, []);
      incoming.set(block.id, []);
      undirected.set(block.id, new Set<string>());
      breakpointMap.set(block.id, block.meta?.breakpoint === true);
      languageMap.set(block.id, normalizeCodeLanguage(block.meta?.language));
    }

    for (const source of codeBlocks) {
      const sourceEdges = source.connections || [];
      for (const targetId of sourceEdges) {
        if (!codeById.has(targetId) || targetId === source.id) continue;
        const sourceOut = outgoing.get(source.id)!;
        if (!sourceOut.includes(targetId)) {
          sourceOut.push(targetId);
        }
        const targetIn = incoming.get(targetId)!;
        if (!targetIn.includes(source.id)) {
          targetIn.push(source.id);
        }
        undirected.get(source.id)!.add(targetId);
        undirected.get(targetId)!.add(source.id);
      }
    }

    const sortByCanvas = (ids: string[]) => (
      [...ids].sort((a, b) => {
        const aBlock = codeById.get(a);
        const bBlock = codeById.get(b);
        if (!aBlock || !bBlock) return 0;
        if (aBlock.position.x !== bBlock.position.x) {
          return aBlock.position.x - bBlock.position.x;
        }
        return aBlock.position.y - bBlock.position.y;
      })
    );

    const collectComponent = (startId: string) => {
      if (!codeById.has(startId)) return [];
      const queue = [startId];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        for (const nextId of undirected.get(id) || []) {
          if (!visited.has(nextId)) {
            queue.push(nextId);
          }
        }
      }
      return sortByCanvas(Array.from(visited));
    };

    const getTopologicalOrder = (componentIds: string[]) => {
      const componentSet = new Set(componentIds);
      const indegree = new Map<string, number>(componentIds.map((id) => [id, 0]));
      for (const id of componentIds) {
        for (const nextId of outgoing.get(id) || []) {
          if (componentSet.has(nextId)) {
            indegree.set(nextId, (indegree.get(nextId) || 0) + 1);
          }
        }
      }

      const queue = sortByCanvas(componentIds.filter((id) => (indegree.get(id) || 0) === 0));
      const order: string[] = [];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        order.push(current);
        for (const nextId of outgoing.get(current) || []) {
          if (!componentSet.has(nextId)) continue;
          indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
          if ((indegree.get(nextId) || 0) === 0 && !visited.has(nextId)) {
            queue.push(nextId);
            queue.sort((a, b) => {
              const aBlock = codeById.get(a)!;
              const bBlock = codeById.get(b)!;
              if (aBlock.position.x !== bBlock.position.x) {
                return aBlock.position.x - bBlock.position.x;
              }
              return aBlock.position.y - bBlock.position.y;
            });
          }
        }
      }

      const hasCycle = order.length !== componentIds.length;
      if (hasCycle) {
        const remaining = componentIds.filter((id) => !visited.has(id));
        order.push(...sortByCanvas(remaining));
      }
      return { order, hasCycle };
    };

    const linkedContentMap = new Map<string, string[]>();
    const linkedStatsMap = new Map<string, { total: number; sameLanguage: number; mixedLanguage: number }>();
    for (const block of codeBlocks) {
      const component = collectComponent(block.id);
      const linkedIds = component.filter((id) => id !== block.id);
      const currentLanguage = languageMap.get(block.id) ?? 'javascript';
      const sameLanguageIds = linkedIds.filter((id) => (languageMap.get(id) ?? 'javascript') === currentLanguage);
      linkedStatsMap.set(block.id, {
        total: linkedIds.length,
        sameLanguage: sameLanguageIds.length,
        mixedLanguage: linkedIds.length - sameLanguageIds.length
      });
      linkedContentMap.set(
        block.id,
        sameLanguageIds.map((id) => codeById.get(id)?.content || '').filter(Boolean)
      );
    }

    return {
      codeById,
      collectComponent,
      getTopologicalOrder,
      linkedContentMap,
      linkedStatsMap,
      breakpointMap,
      languageMap
    };
  }, [note.blocks]);

  const toggleCodeBreakpoint = (blockId: string) => {
    if (!isOwner) return;
    const nextBlocks = note.blocks.map((item) => {
      if (item.id !== blockId || item.type !== 'code') return item;
      const nextValue = !(item.meta?.breakpoint === true);
      return {
        ...item,
        meta: {
          ...(item.meta || {}),
          breakpoint: nextValue
        }
      };
    });
    onChange(nextBlocks);
  };

  const executeCodeChain = useCallback(async (blockId: string) => {
    if (!isOwner) return;
    if (runningCodeChain.length > 0) return;
    if (!codeGraph.codeById.has(blockId)) return;

    const component = codeGraph.collectComponent(blockId);
    const safeComponent = component.length > 0 ? component : [blockId];
    const startLanguage = codeGraph.languageMap.get(blockId) ?? 'javascript';
    const sameLanguageComponent = safeComponent.filter((id) => (codeGraph.languageMap.get(id) ?? 'javascript') === startLanguage);
    const skippedLanguageCount = safeComponent.length - sameLanguageComponent.length;
    const { order, hasCycle } = codeGraph.getTopologicalOrder(sameLanguageComponent);
    const runnableOrder = order.filter((id) => (codeGraph.codeById.get(id)?.content || '').trim().length > 0);

    if (runnableOrder.length === 0) return;

    const stepMs = Math.min(1200, Math.max(60, layoutSettings.executionStepMs));
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...runtimeArgs: unknown[]) => Promise<unknown>;
    let currentBlockId: string | null = null;

    setRunningCodeChain(runnableOrder);
    setBreakpointHitId(null);

    const runStep = async (id: string) => {
      currentBlockId = id;
      setActiveRunningCodeId(id);
      const hasBreakpoint = codeGraph.breakpointMap.get(id) === true;
      setBreakpointHitId(hasBreakpoint ? id : null);
      await wait(hasBreakpoint ? Math.max(stepMs * 3, 500) : stepMs);
    };

    if (!canExecuteInBrowser(startLanguage)) {
      try {
        for (const id of runnableOrder) {
          await runStep(id);
        }
        const outputLines = [
          getCodeBackendHint(startLanguage),
          `[info] 当前链路语言: ${getCodeLanguageLabel(startLanguage)} (${startLanguage})`,
          skippedLanguageCount > 0 ? `[info] 已跳过 ${skippedLanguageCount} 个跨语言连接块。` : '',
          hasCycle ? '[warning] cycle detected; fallback order appended.' : '',
          `[order] ${runnableOrder.join(' -> ')}`
        ].filter(Boolean);
        const nextBlocks = note.blocks.map((item) => (
          item.id === blockId ? { ...item, output: outputLines.join('\n'), error: undefined } : item
        ));
        onChange(nextBlocks);
      } finally {
        setActiveRunningCodeId(null);
        setRunningCodeChain([]);
        setBreakpointHitId(null);
      }
      return;
    }

    const originalLog = console.log;
    try {
      const logs: string[] = [];
      console.log = (...args) => {
        logs.push(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
      };
      const runnerBody = runnableOrder
        .map((id) => `await __step(${JSON.stringify(id)});\n${codeGraph.codeById.get(id)?.content || ''}`)
        .join('\n\n');
      const fn = new AsyncFunction('__step', runnerBody) as (
        __step: (id: string) => Promise<void>
      ) => Promise<unknown>;
      const result = await fn(runStep);

      let output = logs.join('\n');
      if (result !== undefined) {
        output += `${output ? '\n' : ''}${String(result)}`;
      }
      if (skippedLanguageCount > 0) {
        output += `${output ? '\n' : ''}[info] skipped ${skippedLanguageCount} cross-language block(s).`;
      }
      if (hasCycle) {
        output += `${output ? '\n' : ''}[warning] cycle detected; fallback order appended.`;
      }

      const nextBlocks = note.blocks.map((item) => (
        item.id === blockId ? { ...item, output: output || 'undefined', error: undefined } : item
      ));
      onChange(nextBlocks);
    } catch (error: any) {
      const errorPrefix = currentBlockId ? `[${currentBlockId}] ` : '';
      const nextBlocks = note.blocks.map((item) => (
        item.id === blockId ? { ...item, error: `${errorPrefix}${error.toString()}`, output: undefined } : item
      ));
      onChange(nextBlocks);
    } finally {
      console.log = originalLog;
      setActiveRunningCodeId(null);
      setRunningCodeChain([]);
      setBreakpointHitId(null);
    }
  }, [codeGraph, isOwner, layoutSettings.executionStepMs, note.blocks, onChange, runningCodeChain.length]);

  const connectionLines = useMemo<ConnectionLine[]>(() => {
    const lines: ConnectionLine[] = [];
    const blockMap = new Map(note.blocks.map((item) => [item.id, item]));

    for (const source of note.blocks) {
      if (source.type === 'group' || !source.connections || source.connections.length === 0) continue;
      const sourcePos = getRenderedPosition(source);
      const sourceSize = getBlockSize(source);
      const sourceCenterX = sourcePos.x + sourceSize.width / 2;
      const y1 = sourcePos.y + sourceSize.height / 2;

      for (const targetId of source.connections) {
        const target = blockMap.get(targetId);
        if (!target || target.type === 'group') continue;

        const targetPos = getRenderedPosition(target);
        const targetSize = getBlockSize(target);
        const targetCenterX = targetPos.x + targetSize.width / 2;
        const y2 = targetPos.y + targetSize.height / 2;
        const isTargetRight = targetCenterX >= sourceCenterX;
        const direction = isTargetRight ? 1 : -1;
        const x1 = isTargetRight ? sourcePos.x + sourceSize.width : sourcePos.x;
        const x2 = isTargetRight ? targetPos.x : targetPos.x + targetSize.width;
        const curveStrength = Math.min(280, Math.max(90, Math.abs(x2 - x1) * 0.55));
        const c1x = x1 + direction * curveStrength;
        const c2x = x2 - direction * curveStrength;

        lines.push({
          key: `${source.id}->${target.id}`,
          path: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
          x1,
          y1,
          x2,
          y2,
          active: connectingFromId === source.id || connectingFromId === target.id
        });
      }
    }

    return lines;
  }, [connectingFromId, getBlockSize, getRenderedPosition, note.blocks]);

  const blockIndexMap = useMemo(
    () => new Map(note.blocks.map((item, index) => [item.id, index])),
    [note.blocks]
  );

  const sortedBlocks = [...note.blocks].sort((a, b) => {
    if (a.type === 'group' && b.type !== 'group') return -1;
    if (a.type !== 'group' && b.type === 'group') return 1;
    const indexA = blockIndexMap.get(a.id) ?? 0;
    const indexB = blockIndexMap.get(b.id) ?? 0;
    const layerA = getBlockLayer(a, indexA);
    const layerB = getBlockLayer(b, indexB);
    if (layerA !== layerB) return layerA - layerB;
    return indexA - indexB;
  });

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full overflow-hidden relative bg-[var(--color-paper)] ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onContextMenu={handleContextMenu}
      onClick={closeContextMenu}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        id="canvas-zoom-shell"
        ref={zoomShellRef}
        className="relative"
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
      >
      <div
        id="canvas-bg"
        ref={canvasBgRef}
        className="relative"
        style={{
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          transform: 'scale(1)',
          transformOrigin: 'top left',
          willChange: 'transform'
        }}
      >
        <div className="absolute top-[2400px] left-[2400px] pointer-events-none opacity-30 select-none">
          <h1 className="text-6xl font-hand font-bold text-[var(--color-ink)] mb-2">
            {note.title}
          </h1>
          <p className="text-[var(--color-ink-light)] text-sm font-mono">
            {isOwner
              ? 'Right-click to add blocks. Drag handle to move. Use Connect for block linking.'
              : 'Visitor mode: read-only canvas. Drag background to pan.'}
          </p>
        </div>

        {connectionLines.length > 0 && (
          <svg
            className="absolute left-0 top-0 pointer-events-none z-[5]"
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          >
            <defs>
              <marker id="code-flow-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 3.5 L 0 7 z" fill="var(--color-accent-blue)" fillOpacity="0.4" />
              </marker>
            </defs>
            {connectionLines.map((line) => (
              <g key={line.key}>
                <path
                  d={line.path}
                  fill="none"
                  stroke="var(--color-accent-blue)"
                  strokeOpacity={line.active ? 0.62 : 0.24}
                  strokeWidth={line.active ? 2.2 : 1.5}
                  strokeDasharray={line.active ? '4 3' : '0'}
                  strokeLinecap="round"
                  markerEnd="url(#code-flow-arrow)"
                />
                <circle cx={line.x1} cy={line.y1} r={2.3} fill="var(--color-accent-blue)" fillOpacity={line.active ? 0.42 : 0.24} />
                <circle cx={line.x2} cy={line.y2} r={2.8} fill="var(--color-accent-blue)" fillOpacity={line.active ? 0.5 : 0.28} />
              </g>
            ))}
          </svg>
        )}

        {dragGuides.x !== null && (
          <div
            className="absolute top-0 h-full border-l border-dashed border-[var(--color-accent-blue)]/80 pointer-events-none z-[4]"
            style={{ left: dragGuides.x }}
          />
        )}
        {dragGuides.y !== null && (
          <div
            className="absolute left-0 w-full border-t border-dashed border-[var(--color-accent-blue)]/80 pointer-events-none z-[4]"
            style={{ top: dragGuides.y }}
          />
        )}

        {sortedBlocks.map((block) => (
          <Block 
            key={block.id}
            block={block} 
            onChange={(updates) => updateBlock(block.id, updates)} 
            onDelete={() => deleteBlock(block.id)}
            onRequestAI={(text) => onRequestAI(text, 'block')}
            onOrganize={() => organizeGroup(block.id)}
            isOwner={isOwner}
            onResolveDragPosition={(position, phase) => resolveDragPosition(block.id, position, phase)}
            onConnect={() => handleConnectionAction(block.id)}
            isConnectionSource={connectingFromId === block.id}
            isConnecting={Boolean(connectingFromId)}
            linkedCode={codeGraph.linkedContentMap.get(block.id) || []}
            onRunCode={() => executeCodeChain(block.id)}
            isCodeRunning={runningCodeChain.includes(block.id)}
            isCodeActive={activeRunningCodeId === block.id}
            onToggleBreakpoint={() => toggleCodeBreakpoint(block.id)}
            hasBreakpoint={codeGraph.breakpointMap.get(block.id) === true}
            isBreakpointHit={breakpointHitId === block.id}
            isAnyCodeExecuting={runningCodeChain.length > 0}
            showBlockFrames={layoutSettings.showBlockFrames}
            onFocusBlock={() => bringBlockToFront(block.id)}
            previewOffset={getBlockPreviewOffset(block)}
            onDragPreview={block.type === 'group' ? (position) => handleGroupDragPreview(block.id, position) : undefined}
            onDragPreviewEnd={block.type === 'group' ? () => clearGroupDragPreview(block.id) : undefined}
            codeLanguage={codeGraph.languageMap.get(block.id)}
            onCodeLanguageChange={(language) => updateBlock(block.id, {
              meta: {
                ...(block.meta || {}),
                language
              }
            })}
            linkedCodeStats={codeGraph.linkedStatsMap.get(block.id)}
          />
        ))}
      </div>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-50 bg-[var(--color-paper)] border border-[var(--color-ink)]/10 shadow-xl rounded-xl py-2 w-52 flex flex-col"
          style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
        >
          {BLOCK_LIBRARY.map((item) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.type}>
                {item.type === 'group' && <div className="h-px bg-[var(--color-ink)]/10 my-1 mx-2"></div>}
                <button
                  onClick={() => addBlock(item.type)}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--color-ink)]/5 text-sm text-[var(--color-ink)] text-left"
                >
                  <Icon size={16} className="opacity-60" /> {item.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
