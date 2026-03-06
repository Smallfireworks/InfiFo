import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlockData } from '../types';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Play,
  Sparkles,
  Trash2,
  Edit3,
  Check,
  GripHorizontal,
  LayoutList,
  Lock,
  Unlock,
  Link2,
  Upload,
  Eraser,
  CircleDot
} from 'lucide-react';
import { motion, useDragControls, useMotionValue } from 'motion/react';

interface BlockProps {
  block: BlockData;
  onChange: (updates: Partial<BlockData>) => void;
  onDelete: () => void;
  onRequestAI: (text: string) => void;
  onOrganize?: () => void;
  isOwner: boolean;
  onResolveDragPosition?: (
    position: { x: number; y: number },
    phase: 'move' | 'end'
  ) => { x: number; y: number };
  onConnect?: () => void;
  isConnectionSource?: boolean;
  isConnecting?: boolean;
  linkedCode?: string[];
  onRunCode?: () => void;
  isCodeRunning?: boolean;
  isCodeActive?: boolean;
  showBlockFrames?: boolean;
  onToggleBreakpoint?: () => void;
  hasBreakpoint?: boolean;
  isBreakpointHit?: boolean;
  isAnyCodeExecuting?: boolean;
  onFocusBlock?: () => void;
}

type DrawTool = 'pen' | 'eraser';
type GraphMode = 'function' | 'geometry';
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type GraphCommand =
  | { type: 'point'; x: number; y: number; label: string }
  | { type: 'segment'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'vector'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> };

const GRAPH_COLORS = ['#1f4f9d', '#8b0000', '#0b7a3e', '#8b5a00', '#5d2f86', '#3b4f5c'];

function getDefaultBlockSize(block: BlockData) {
  if (block.size) return block.size;
  switch (block.type) {
    case 'code':
      return { width: 500, height: 240 };
    case 'image':
      return { width: 420, height: 280 };
    case 'music':
      return { width: 420, height: 220 };
    case 'draw':
      return { width: 460, height: 320 };
    case 'graph':
      return { width: 560, height: 360 };
    case 'group':
      return { width: 600, height: 400 };
    default:
      return { width: 450, height: 180 };
  }
}

function getMinBlockSize(block: BlockData) {
  switch (block.type) {
    case 'code':
      return { width: 320, height: 180 };
    case 'image':
      return { width: 260, height: 180 };
    case 'music':
      return { width: 260, height: 140 };
    case 'draw':
      return { width: 320, height: 240 };
    case 'graph':
      return { width: 360, height: 260 };
    case 'markdown':
      return { width: 260, height: 120 };
    default:
      return { width: 240, height: 120 };
  }
}

function resizeCursor(direction: ResizeDirection | null) {
  if (!direction) return 'default';
  switch (direction) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return 'default';
  }
}

function parseNumberToken(token: string | undefined): number | null {
  if (typeof token !== 'string' || token.trim() === '') return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function parseGraphCommands(content: string): GraphCommand[] {
  const commands: GraphCommand[] = [];
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();

    if (cmd === 'point') {
      const x = parseNumberToken(parts[1]);
      const y = parseNumberToken(parts[2]);
      if (x === null || y === null) continue;
      commands.push({ type: 'point', x, y, label: parts.slice(3).join(' ') });
      continue;
    }

    if (cmd === 'segment' || cmd === 'line' || cmd === 'vector') {
      const x1 = parseNumberToken(parts[1]);
      const y1 = parseNumberToken(parts[2]);
      const x2 = parseNumberToken(parts[3]);
      const y2 = parseNumberToken(parts[4]);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      commands.push({ type: cmd, x1, y1, x2, y2 });
      continue;
    }

    if (cmd === 'circle') {
      const cx = parseNumberToken(parts[1]);
      const cy = parseNumberToken(parts[2]);
      const r = parseNumberToken(parts[3]);
      if (cx === null || cy === null || r === null || r <= 0) continue;
      commands.push({ type: 'circle', cx, cy, r });
      continue;
    }

    if (cmd === 'polygon') {
      const raw = parts.slice(1).map(parseNumberToken);
      if (raw.some((value) => value === null) || raw.length < 6 || raw.length % 2 !== 0) continue;
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < raw.length; i += 2) {
        points.push({ x: raw[i] as number, y: raw[i + 1] as number });
      }
      commands.push({ type: 'polygon', points });
    }
  }

  return commands;
}

function toGraphNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeGraphViewport(meta: Record<string, unknown>) {
  const xMin = toGraphNumber(meta.graphXMin, -10);
  const xMax = toGraphNumber(meta.graphXMax, 10);
  const yMin = toGraphNumber(meta.graphYMin, -10);
  const yMax = toGraphNumber(meta.graphYMax, 10);
  const safeXMin = Math.min(xMin, xMax - 0.5);
  const safeXMax = Math.max(xMax, safeXMin + 0.5);
  const safeYMin = Math.min(yMin, yMax - 0.5);
  const safeYMax = Math.max(yMax, safeYMin + 0.5);
  return { xMin: safeXMin, xMax: safeXMax, yMin: safeYMin, yMax: safeYMax };
}

function getGridStep(span: number) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rough = span / 10;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  if (normalized <= 1.5) return magnitude;
  if (normalized <= 3.5) return 2 * magnitude;
  if (normalized <= 7.5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildGraphEvaluator(expression: string): ((x: number) => number) | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  const invalidPattern = /[;{}[\]`\\]|=>|\b(?:window|document|globalThis|Function|constructor|import|new|eval|process)\b/i;
  if (invalidPattern.test(trimmed)) return null;

  let jsExpr = trimmed
    .replace(/π/gi, 'pi')
    .replace(/\^/g, '**')
    .replace(/\bln\s*\(/gi, 'Math.log(')
    .replace(/\bsin\s*\(/gi, 'Math.sin(')
    .replace(/\bcos\s*\(/gi, 'Math.cos(')
    .replace(/\btan\s*\(/gi, 'Math.tan(')
    .replace(/\basin\s*\(/gi, 'Math.asin(')
    .replace(/\bacos\s*\(/gi, 'Math.acos(')
    .replace(/\batan\s*\(/gi, 'Math.atan(')
    .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
    .replace(/\babs\s*\(/gi, 'Math.abs(')
    .replace(/\blog\s*\(/gi, 'Math.log10(')
    .replace(/\bexp\s*\(/gi, 'Math.exp(')
    .replace(/\bpow\s*\(/gi, 'Math.pow(')
    .replace(/\bfloor\s*\(/gi, 'Math.floor(')
    .replace(/\bceil\s*\(/gi, 'Math.ceil(')
    .replace(/\bround\s*\(/gi, 'Math.round(')
    .replace(/\bmin\s*\(/gi, 'Math.min(')
    .replace(/\bmax\s*\(/gi, 'Math.max(')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E');

  jsExpr = jsExpr.replace(/\bX\b/g, 'x');
  try {
    const fn = new Function('x', `"use strict"; return (${jsExpr});`) as (x: number) => number;
    return fn;
  } catch {
    return null;
  }
}

export function Block({
  block,
  onChange,
  onDelete,
  onRequestAI,
  onOrganize,
  isOwner,
  onResolveDragPosition,
  onConnect,
  isConnectionSource = false,
  isConnecting = false,
  linkedCode = [],
  onRunCode,
  isCodeRunning = false,
  isCodeActive = false,
  showBlockFrames = true,
  onToggleBreakpoint,
  hasBreakpoint = false,
  isBreakpointHit = false,
  isAnyCodeExecuting = false,
  onFocusBlock
}: BlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const [isSketching, setIsSketching] = useState(false);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [hoverResizeDir, setHoverResizeDir] = useState<ResizeDirection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);
  const resizeSessionRef = useRef<{
    direction: ResizeDirection;
    startX: number;
    startY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    currentWidth: number;
    currentHeight: number;
    currentX: number;
    currentY: number;
    pointerId: number;
    cleanup: (() => void) | null;
  } | null>(null);
  const dragControls = useDragControls();

  const x = useMotionValue(block.position.x);
  const y = useMotionValue(block.position.y);
  const canDrag = isOwner && !(block.locked && block.type !== 'group');
  const canToggleLock = isOwner && block.type !== 'group' && Boolean(block.parentId || block.locked);
  const canResize = isOwner && !block.locked;
  const baseSize = useMemo(() => getDefaultBlockSize(block), [block]);
  const minSize = useMemo(() => getMinBlockSize(block), [block]);
  const activeSize = resizePreview || baseSize;

  const blockMeta = block.meta ?? {};
  const drawColor = typeof blockMeta.drawColor === 'string' ? blockMeta.drawColor : '#2c2c2c';
  const drawSize = typeof blockMeta.drawSize === 'number' ? Math.min(32, Math.max(1, blockMeta.drawSize)) : 2;
  const drawTool: DrawTool = blockMeta.drawTool === 'eraser' ? 'eraser' : 'pen';
  const graphMode: GraphMode = blockMeta.graphMode === 'geometry' ? 'geometry' : 'function';
  const graphViewport = useMemo(() => normalizeGraphViewport(blockMeta), [blockMeta]);
  const graphCommands = useMemo(() => parseGraphCommands(block.content), [block.content]);
  const graphFunctionLines = useMemo(
    () => block.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [block.content]
  );
  const graphFunctionErrors = useMemo(() => {
    if (graphMode !== 'function') return [];
    const errors: string[] = [];
    graphFunctionLines.forEach((line, index) => {
      if (!buildGraphEvaluator(line)) {
        errors.push(`Line ${index + 1}: ${line}`);
      }
    });
    return errors;
  }, [graphFunctionLines, graphMode]);

  const drawCanvasWidth = useMemo(() => Math.max(240, activeSize.width - 24), [activeSize.width]);
  const drawCanvasHeight = useMemo(() => Math.max(160, activeSize.height - 96), [activeSize.height]);
  const graphCanvasWidth = useMemo(() => Math.max(300, activeSize.width - 24), [activeSize.width]);
  const graphCanvasHeight = useMemo(() => Math.max(190, activeSize.height - 148), [activeSize.height]);

  useEffect(() => {
    x.set(block.position.x);
    y.set(block.position.y);
  }, [block.position.x, block.position.y, x, y]);

  useEffect(() => {
    if (!isOwner) {
      setIsEditing(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      if (isEditing && block.type === 'markdown' && isOwner) {
        textareaRef.current.focus();
      }
    }
  }, [block.content, isEditing, block.type, isOwner]);

  useEffect(() => {
    setMediaError(false);
  }, [block.content, block.id]);

  useEffect(() => {
    if (block.type !== 'draw') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    canvas.width = drawCanvasWidth;
    canvas.height = drawCanvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = drawSize;
    ctx.strokeStyle = drawColor;
    ctx.globalCompositeOperation = 'source-over';

    if (block.content) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = block.content;
    }
  }, [block.content, block.type, drawCanvasHeight, drawCanvasWidth, drawColor, drawSize]);

  useEffect(() => {
    if (block.type !== 'graph') return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;

    canvas.width = graphCanvasWidth;
    canvas.height = graphCanvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { xMin, xMax, yMin, yMax } = graphViewport;
    const rangeX = xMax - xMin;
    const rangeY = yMax - yMin;
    const toCanvasX = (value: number) => ((value - xMin) / rangeX) * canvas.width;
    const toCanvasY = (value: number) => canvas.height - ((value - yMin) / rangeY) * canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const stepX = getGridStep(rangeX);
    const stepY = getGridStep(rangeY);
    ctx.strokeStyle = 'rgba(44, 44, 44, 0.09)';
    ctx.lineWidth = 1;

    for (let xValue = Math.ceil(xMin / stepX) * stepX; xValue <= xMax; xValue += stepX) {
      const px = toCanvasX(xValue);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
    }
    for (let yValue = Math.ceil(yMin / stepY) * stepY; yValue <= yMax; yValue += stepY) {
      const py = toCanvasY(yValue);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.width, py);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(44, 44, 44, 0.34)';
    ctx.lineWidth = 1.4;
    if (xMin <= 0 && xMax >= 0) {
      const axisX = toCanvasX(0);
      ctx.beginPath();
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, canvas.height);
      ctx.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const axisY = toCanvasY(0);
      ctx.beginPath();
      ctx.moveTo(0, axisY);
      ctx.lineTo(canvas.width, axisY);
      ctx.stroke();
    }

    if (graphMode === 'function') {
      const sampleCount = Math.max(220, Math.min(1600, Math.floor(canvas.width * 2)));
      graphFunctionLines.forEach((expression, lineIndex) => {
        const evaluator = buildGraphEvaluator(expression);
        if (!evaluator) return;

        ctx.beginPath();
        ctx.lineWidth = 2.1;
        ctx.strokeStyle = GRAPH_COLORS[lineIndex % GRAPH_COLORS.length];

        let started = false;
        let previousY = 0;
        for (let i = 0; i <= sampleCount; i += 1) {
          const xValue = xMin + (i / sampleCount) * rangeX;
          let yValue: number;
          try {
            yValue = evaluator(xValue);
          } catch {
            started = false;
            continue;
          }
          if (!Number.isFinite(yValue) || Math.abs(yValue) > 1e6) {
            started = false;
            continue;
          }

          const px = toCanvasX(xValue);
          const py = toCanvasY(yValue);
          if (!Number.isFinite(py)) {
            started = false;
            continue;
          }
          if (started && Math.abs(py - previousY) > canvas.height * 1.8) {
            started = false;
          }
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
          previousY = py;
        }
        ctx.stroke();
      });
      return;
    }

    graphCommands.forEach((command, index) => {
      const color = GRAPH_COLORS[index % GRAPH_COLORS.length];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.9;

      if (command.type === 'point') {
        const px = toCanvasX(command.x);
        const py = toCanvasY(command.y);
        ctx.beginPath();
        ctx.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx.fill();
        if (command.label) {
          ctx.font = '12px JetBrains Mono, monospace';
          ctx.fillText(command.label, px + 6, py - 6);
        }
        return;
      }

      if (command.type === 'segment' || command.type === 'vector') {
        const x1 = toCanvasX(command.x1);
        const y1 = toCanvasY(command.y1);
        const x2 = toCanvasX(command.x2);
        const y2 = toCanvasY(command.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (command.type === 'vector') {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 9;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - head * Math.cos(angle - 0.35), y2 - head * Math.sin(angle - 0.35));
          ctx.lineTo(x2 - head * Math.cos(angle + 0.35), y2 - head * Math.sin(angle + 0.35));
          ctx.closePath();
          ctx.fill();
        }
        return;
      }

      if (command.type === 'line') {
        const dx = command.x2 - command.x1;
        const dy = command.y2 - command.y1;
        if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) return;
        const scale = 2_000;
        const sx = toCanvasX(command.x1 - dx * scale);
        const sy = toCanvasY(command.y1 - dy * scale);
        const ex = toCanvasX(command.x1 + dx * scale);
        const ey = toCanvasY(command.y1 + dy * scale);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        return;
      }

      if (command.type === 'circle') {
        const cx = toCanvasX(command.cx);
        const cy = toCanvasY(command.cy);
        const rx = Math.abs(toCanvasX(command.cx + command.r) - cx);
        const ry = Math.abs(toCanvasY(command.cy + command.r) - cy);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      if (command.type === 'polygon') {
        if (command.points.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(command.points[0].x), toCanvasY(command.points[0].y));
        for (let i = 1; i < command.points.length; i += 1) {
          ctx.lineTo(toCanvasX(command.points[i].x), toCanvasY(command.points[i].y));
        }
        ctx.closePath();
        ctx.stroke();
      }
    });
  }, [
    block.type,
    graphCanvasHeight,
    graphCanvasWidth,
    graphCommands,
    graphFunctionLines,
    graphMode,
    graphViewport
  ]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (selectionRect) {
        setSelectionRect(null);
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [selectionRect]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isOwner) return;
    onChange({ content: e.target.value });
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const executeCode = () => {
    if (!isOwner) return;
    if (onRunCode) {
      onRunCode();
      return;
    }
    const originalLog = console.log;
    try {
      const logs: string[] = [];
      console.log = (...args) => {
        logs.push(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
      };

      const fullCode = [...linkedCode, block.content].join('\n\n');
      const fn = new Function(fullCode);
      const result = fn();

      let output = logs.join('\n');
      if (result !== undefined) {
        output += `${output ? '\n' : ''}${String(result)}`;
      }
      onChange({ output: output || 'undefined', error: undefined });
    } catch (error: any) {
      onChange({ error: error.toString(), output: undefined });
    } finally {
      console.log = originalLog;
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionRect(rect);
      setSelectedText(selection.toString());
    } else {
      setSelectionRect(null);
      setSelectedText('');
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ content: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOwner) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const point = getCanvasPoint(e);
    context.lineWidth = drawSize;
    context.strokeStyle = drawColor;
    context.globalCompositeOperation = drawTool === 'eraser' ? 'destination-out' : 'source-over';
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsSketching(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOwner || !isSketching) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const point = getCanvasPoint(e);
    context.lineWidth = drawSize;
    context.strokeStyle = drawColor;
    context.globalCompositeOperation = drawTool === 'eraser' ? 'destination-out' : 'source-over';
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endSketch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOwner || !isSketching) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    setIsSketching(false);
    onChange({ content: canvas.toDataURL('image/png') });
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  };

  const clearSketch = () => {
    if (!isOwner) return;
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange({ content: '' });
  };

  const updateDrawMeta = (updates: Partial<Record<'drawColor' | 'drawSize' | 'drawTool', unknown>>) => {
    onChange({
      meta: {
        ...(block.meta || {}),
        ...updates
      }
    });
  };

  const updateGraphMeta = (updates: Partial<Record<'graphMode' | 'graphXMin' | 'graphXMax' | 'graphYMin' | 'graphYMax', unknown>>) => {
    onChange({
      meta: {
        ...(block.meta || {}),
        ...updates
      }
    });
  };

  const detectResizeDirection = (event: React.PointerEvent<HTMLDivElement>): ResizeDirection | null => {
    if (!canResize) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = showBlockFrames ? 9 : 7;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const nearLeft = localX <= edge;
    const nearRight = localX >= rect.width - edge;
    const nearTop = localY <= edge;
    const nearBottom = localY >= rect.height - edge;

    const allowNorthWest = block.type !== 'group';

    if (nearTop && nearLeft && allowNorthWest) return 'nw';
    if (nearTop && nearRight && allowNorthWest) return 'ne';
    if (nearBottom && nearLeft && allowNorthWest) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearLeft && allowNorthWest) return 'w';
    if (nearRight) return 'e';
    if (nearTop && allowNorthWest) return 'n';
    if (nearBottom) return 's';
    return null;
  };

  const startResizeSession = (event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection) => {
    event.preventDefault();
    event.stopPropagation();

    const onPointerMove = (moveEvent: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session) return;
      const dx = moveEvent.clientX - session.startX;
      const dy = moveEvent.clientY - session.startY;

      let nextWidth = session.width;
      let nextHeight = session.height;
      let nextX = session.x;
      let nextY = session.y;

      if (session.direction.includes('e')) {
        nextWidth = session.width + dx;
      }
      if (session.direction.includes('s')) {
        nextHeight = session.height + dy;
      }
      if (session.direction.includes('w')) {
        nextWidth = session.width - dx;
        nextX = session.x + dx;
      }
      if (session.direction.includes('n')) {
        nextHeight = session.height - dy;
        nextY = session.y + dy;
      }

      if (nextWidth < minSize.width) {
        if (session.direction.includes('w')) {
          nextX -= (minSize.width - nextWidth);
        }
        nextWidth = minSize.width;
      }
      if (nextHeight < minSize.height) {
        if (session.direction.includes('n')) {
          nextY -= (minSize.height - nextHeight);
        }
        nextHeight = minSize.height;
      }

      if (block.type === 'group') {
        nextX = session.x;
        nextY = session.y;
      }

      session.currentWidth = Math.round(nextWidth);
      session.currentHeight = Math.round(nextHeight);
      session.currentX = Math.round(nextX);
      session.currentY = Math.round(nextY);
      x.set(session.currentX);
      y.set(session.currentY);
      setResizePreview({ width: session.currentWidth, height: session.currentHeight });
    };

    const onPointerUp = () => {
      const session = resizeSessionRef.current;
      if (!session) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const nextSize = { width: session.currentWidth, height: session.currentHeight };
      const nextX = session.currentX;
      const nextY = session.currentY;
      const updates: Partial<BlockData> = { size: nextSize };
      if (block.type !== 'group' && (nextX !== block.position.x || nextY !== block.position.y)) {
        updates.position = { x: nextX, y: nextY };
      }
      onChange(updates);
      resizeSessionRef.current = null;
      setResizePreview(null);
      setHoverResizeDir(null);
    };

    resizeSessionRef.current = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      width: activeSize.width,
      height: activeSize.height,
      x: block.position.x,
      y: block.position.y,
      currentWidth: activeSize.width,
      currentHeight: activeSize.height,
      currentX: block.position.x,
      currentY: block.position.y,
      pointerId: event.pointerId,
      cleanup: () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
    };

    setResizePreview({ width: activeSize.width, height: activeSize.height });
    setHoverResizeDir(direction);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleBlockPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    onFocusBlock?.();
    if (event.button !== 0) return;
    const direction = detectResizeDirection(event);
    if (!direction) return;
    startResizeSession(event, direction);
  };

  const handleBlockPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize || resizeSessionRef.current) return;
    setHoverResizeDir(detectResizeDirection(event));
  };

  const handleBlockPointerLeave = () => {
    if (!resizeSessionRef.current) {
      setHoverResizeDir(null);
    }
  };

  useEffect(() => () => {
    resizeSessionRef.current?.cleanup?.();
    resizeSessionRef.current = null;
  }, []);

  const codeRunningStyle = block.type === 'code'
    ? {
      boxShadow: isBreakpointHit
        ? '0 0 0 2px rgba(139, 0, 0, 0.78), 0 0 24px rgba(139, 0, 0, 0.28)'
        : (isCodeRunning
            ? (isCodeActive
                ? '0 0 0 2px rgba(0, 0, 128, 0.78), 0 0 22px rgba(0, 0, 128, 0.32)'
                : '0 0 0 2px rgba(0, 0, 128, 0.35)')
            : undefined)
    }
    : {};
  const codeShellClass = showBlockFrames
    ? 'rounded-xl overflow-hidden bg-[var(--color-ink)]/[0.03] hover:bg-[var(--color-ink)]/[0.05] border border-[var(--color-ink)]/10 transition-colors h-full flex flex-col'
    : 'overflow-hidden bg-transparent border border-transparent h-full flex flex-col';
  const mediaShellClass = showBlockFrames
    ? 'rounded-xl overflow-hidden bg-[var(--color-ink)]/[0.03] border border-[var(--color-ink)]/10 h-full flex flex-col'
    : 'overflow-hidden bg-transparent border border-transparent h-full flex flex-col';
  const drawingShellClass = showBlockFrames
    ? 'rounded-xl overflow-hidden bg-[var(--color-ink)]/[0.03] border border-[var(--color-ink)]/10 h-full flex flex-col'
    : 'overflow-hidden bg-transparent border border-transparent h-full flex flex-col';
  const groupShellClass = showBlockFrames
    ? 'border-2 border-dashed border-[var(--color-ink)]/20 bg-[var(--color-ink)]/[0.02] rounded-3xl p-2'
    : 'rounded-3xl p-2 bg-transparent border border-transparent';
  const activeResizeCursor = resizeSessionRef.current
    ? resizeCursor(resizeSessionRef.current.direction)
    : resizeCursor(hoverResizeDir);

  return (
    <motion.div
      data-block-id={block.id}
      drag={canDrag}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onDrag={() => {
        if (!canDrag || !onResolveDragPosition) return;
        const resolved = onResolveDragPosition({ x: x.get(), y: y.get() }, 'move');
        if (resolved.x !== x.get()) x.set(resolved.x);
        if (resolved.y !== y.get()) y.set(resolved.y);
      }}
      onDragEnd={() => {
        if (!canDrag) return;
        const resolved = onResolveDragPosition
          ? onResolveDragPosition({ x: x.get(), y: y.get() }, 'end')
          : { x: x.get(), y: y.get() };
        x.set(resolved.x);
        y.set(resolved.y);
        onChange({ position: resolved });
      }}
      style={{
        position: 'absolute',
        x,
        y,
        width: block.type === 'group' ? 'auto' : activeSize.width,
        height: block.type === 'group' ? 'auto' : activeSize.height,
        zIndex: block.type === 'group' ? 0 : 10,
        cursor: canResize ? activeResizeCursor : undefined,
        ...codeRunningStyle
      }}
      className={`notebook-block group ${block.type === 'group' ? groupShellClass : ''}`}
      onMouseUp={handleSelection}
      onPointerMove={handleBlockPointerMove}
      onPointerLeave={handleBlockPointerLeave}
      onPointerDown={handleBlockPointerDown}
    >
      {selectionRect && createPortal(
        <div 
          className="fixed z-[100] transform -translate-x-1/2 -translate-y-full pb-2"
          style={{ 
            left: selectionRect.left + selectionRect.width / 2, 
            top: selectionRect.top 
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onRequestAI(selectedText);
              setSelectionRect(null);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-ink)] text-[var(--color-paper)] rounded-lg shadow-lg hover:bg-[var(--color-ink)]/90 transition-colors text-sm font-medium"
          >
            <Sparkles size={14} /> Ask AI
          </button>
        </div>,
        document.body
      )}

      {canDrag && (
        <div 
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFocusBlock?.();
            dragControls.start(e);
          }}
          className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1.5 bg-[var(--color-paper)] rounded-full border border-[var(--color-ink)]/10 shadow-sm z-30 transition-opacity"
        >
          <GripHorizontal size={16} className="text-[var(--color-ink)]/40" />
        </div>
      )}

      <div className="absolute -top-12 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-30 bg-[var(--color-paper)] p-1 rounded-lg border border-[var(--color-ink)]/10 shadow-md">
        {isOwner && block.type === 'group' && onOrganize && (
          <button 
            onClick={onOrganize}
            className="p-1.5 text-[var(--color-ink-light)] hover:bg-[var(--color-ink)]/10 rounded-md transition-colors"
            title="Organize blocks inside"
          >
            <LayoutList size={16} />
          </button>
        )}
        {isOwner && block.type !== 'group' && onConnect && (
          <button
            onClick={onConnect}
            className={`p-1.5 rounded-md transition-colors ${isConnectionSource ? 'text-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10' : 'text-[var(--color-ink-light)] hover:bg-[var(--color-ink)]/10'}`}
            title={isConnectionSource ? 'Cancel linking' : (isConnecting ? 'Link to this block' : 'Start linking')}
          >
            <Link2 size={16} />
          </button>
        )}
        <button 
          onClick={() => onRequestAI(block.content)}
          className="p-1.5 text-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/10 rounded-md transition-colors"
          title="Ask AI about this block"
        >
          <Sparkles size={16} />
        </button>
        {isOwner && canToggleLock && (
          <button
            onClick={() => onChange(block.locked ? { locked: false, parentId: undefined } : { locked: true })}
            className="p-1.5 text-[var(--color-ink-light)] hover:bg-[var(--color-ink)]/10 rounded-md transition-colors"
            title={block.locked ? 'Unlock block' : 'Lock block'}
          >
            {block.locked ? <Unlock size={16} /> : <Lock size={16} />}
          </button>
        )}
        {isOwner && block.type === 'markdown' && (
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 text-[var(--color-ink-light)] hover:bg-[var(--color-ink)]/10 rounded-md transition-colors"
            title={isEditing ? 'Save' : 'Edit'}
          >
            {isEditing ? <Check size={16} /> : <Edit3 size={16} />}
          </button>
        )}
        {isOwner && (
          <button 
            onClick={onDelete}
            className="p-1.5 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded-md transition-colors"
            title="Delete block"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {isOwner && block.locked && block.type !== 'group' && (
        <div className="absolute -top-2 -left-2 z-20 px-2 py-0.5 rounded-full bg-[var(--color-ink)]/80 text-[var(--color-paper)] text-[10px] font-mono uppercase tracking-wide">
          Locked
        </div>
      )}

      {block.type === 'group' && (
        <div 
          className="min-h-[200px] flex flex-col" 
          style={{ overflow: 'hidden', width: activeSize.width, height: activeSize.height }}
        >
          <input
            value={block.content}
            readOnly={!isOwner}
            onChange={(e) => isOwner && onChange({ content: e.target.value })}
            className="bg-transparent border-none outline-none font-hand text-3xl text-[var(--color-ink)]/60 w-full mb-2 px-2 pt-2"
            placeholder="Area Title"
          />
          <div className="flex-1 pointer-events-none" />
        </div>
      )}

      {block.type === 'markdown' && (
        <div 
          className="h-full min-h-[2rem] px-2 py-1 overflow-auto hover-scroll"
          onDoubleClick={() => isOwner && setIsEditing(true)}
        >
          {isEditing && isOwner ? (
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={handleContentChange}
              onBlur={() => setIsEditing(false)}
              className="w-full h-full min-h-[80px] overflow-auto hover-scroll bg-transparent border-none outline-none resize-none font-mono text-sm text-[var(--color-ink-light)] p-2 rounded-lg bg-[var(--color-ink)]/5 focus:ring-2 ring-[var(--color-ink)]/20"
              placeholder="Write markdown or math here..."
            />
          ) : (
            <div className="markdown-body">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {block.content || '*Empty text*'}
              </Markdown>
            </div>
          )}
        </div>
      )}

      {block.type === 'code' && (
        <div className={codeShellClass}>
          <div className={`flex items-center justify-between px-4 py-2 ${showBlockFrames ? 'border-b border-[var(--color-ink)]/5' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-[var(--color-ink-light)] uppercase tracking-wider">JS</span>
              {linkedCode.length > 0 && (
                <span className="text-[10px] font-mono text-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10 px-1.5 py-0.5 rounded">
                  {linkedCode.length} linked file(s)
                </span>
              )}
              {hasBreakpoint && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isBreakpointHit ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'}`}>
                  Breakpoint
                </span>
              )}
              {isCodeRunning && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isCodeActive ? 'bg-[var(--color-accent-blue)] text-white' : 'bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)]'}`}>
                  {isCodeActive ? 'Running' : 'Queued'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isOwner && onToggleBreakpoint && (
                <button
                  onClick={onToggleBreakpoint}
                  disabled={isAnyCodeExecuting}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${hasBreakpoint ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)]' : 'bg-[var(--color-ink)]/10 text-[var(--color-ink-light)] hover:bg-[var(--color-ink)]/18'}`}
                  title={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
                >
                  <CircleDot size={12} />
                  BP
                </button>
              )}
              {isOwner && (
                <button 
                  onClick={executeCode}
                  disabled={isCodeRunning || isAnyCodeExecuting}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-[var(--color-ink)]/10 text-[var(--color-ink)] rounded hover:bg-[var(--color-ink)]/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Play size={12} /> Run
                </button>
              )}
            </div>
          </div>
          {isOwner ? (
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={handleContentChange}
              className="w-full flex-1 min-h-0 overflow-auto hover-scroll bg-transparent border-none outline-none resize-none font-mono text-sm text-[var(--color-ink)] p-4"
              placeholder="// Write JavaScript code here..."
              spellCheck={false}
            />
          ) : (
            <pre className="p-4 text-sm font-mono text-[var(--color-ink)] whitespace-pre-wrap overflow-auto hover-scroll">{block.content || '// Empty code block'}</pre>
          )}
          
          {(block.output || block.error) && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={`p-4 font-mono text-sm whitespace-pre-wrap overflow-auto hover-scroll max-h-56 ${showBlockFrames ? 'border-t border-[var(--color-ink)]/5' : ''} ${block.error ? 'bg-[var(--color-accent)]/5 text-[var(--color-accent)]' : 'text-[var(--color-ink-light)]'}`}
            >
              <div className="text-[10px] uppercase tracking-wider mb-1 opacity-50 font-bold">
                {block.error ? 'Error' : 'Output'}
              </div>
              {block.error || block.output}
            </motion.div>
          )}
        </div>
      )}

      {block.type === 'image' && (
        <div className={mediaShellClass}>
          {isOwner && (
            <div className={`p-3 flex items-center gap-2 ${showBlockFrames ? 'border-b border-[var(--color-ink)]/10' : ''}`}>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Paste image URL or upload"
                className="flex-1 text-sm px-2 py-1.5 rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)]"
              />
              <label className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-[var(--color-ink)]/10 hover:bg-[var(--color-ink)]/15 cursor-pointer">
                <Upload size={12} />
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleMediaUpload} />
              </label>
            </div>
          )}
          <div className="p-3 flex-1 overflow-auto hover-scroll">
            {block.content && !mediaError ? (
              <img
                src={block.content}
                alt="Notebook"
                className="w-full max-h-[420px] object-contain rounded-md bg-white"
                loading="lazy"
                onError={() => setMediaError(true)}
              />
            ) : (
              <div className="h-32 rounded-md border border-dashed border-[var(--color-ink)]/20 flex items-center justify-center text-sm text-[var(--color-ink-light)]">
                {mediaError ? 'Image failed to load' : 'No image selected'}
              </div>
            )}
          </div>
        </div>
      )}

      {block.type === 'music' && (
        <div className={mediaShellClass}>
          {isOwner && (
            <div className={`p-3 flex items-center gap-2 ${showBlockFrames ? 'border-b border-[var(--color-ink)]/10' : ''}`}>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Paste audio URL or upload"
                className="flex-1 text-sm px-2 py-1.5 rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)]"
              />
              <label className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-[var(--color-ink)]/10 hover:bg-[var(--color-ink)]/15 cursor-pointer">
                <Upload size={12} />
                Upload
                <input type="file" accept="audio/*" className="hidden" onChange={handleMediaUpload} />
              </label>
            </div>
          )}
          <div className="p-3 flex-1 overflow-auto hover-scroll">
            {block.content ? (
              <audio controls className="w-full" src={block.content}>
                Your browser does not support audio playback.
              </audio>
            ) : (
              <div className="h-20 rounded-md border border-dashed border-[var(--color-ink)]/20 flex items-center justify-center text-sm text-[var(--color-ink-light)]">
                No audio selected
              </div>
            )}
          </div>
        </div>
      )}

      {block.type === 'draw' && (
        <div className={drawingShellClass}>
          <div className={`px-3 py-2 flex items-center justify-between ${showBlockFrames ? 'border-b border-[var(--color-ink)]/10' : ''}`}>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-light)]">Canvas</span>
            {isOwner && (
              <div className="flex items-center gap-2">
                <select
                  value={drawTool}
                  onChange={(e) => updateDrawMeta({ drawTool: e.target.value as DrawTool })}
                  className="text-xs rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-1"
                >
                  <option value="pen">Pen</option>
                  <option value="eraser">Eraser</option>
                </select>
                <input
                  type="color"
                  value={drawColor}
                  onChange={(e) => updateDrawMeta({ drawColor: e.target.value })}
                  title="Brush color"
                  className="w-7 h-7 p-0 border-0 bg-transparent"
                />
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={drawSize}
                  onChange={(e) => updateDrawMeta({ drawSize: Number(e.target.value) })}
                  title="Brush size"
                  className="w-20"
                />
                <button
                  onClick={clearSketch}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-[var(--color-ink)]/10 hover:bg-[var(--color-ink)]/20"
                >
                  <Eraser size={12} />
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="p-3 flex-1 overflow-auto hover-scroll">
            <canvas
              ref={drawCanvasRef}
              width={drawCanvasWidth}
              height={drawCanvasHeight}
              onPointerDown={startSketch}
              onPointerMove={moveSketch}
              onPointerUp={endSketch}
              onPointerLeave={endSketch}
              className={`w-full bg-white rounded-md ${showBlockFrames ? 'border border-[var(--color-ink)]/15' : 'border border-transparent'} ${isOwner ? 'cursor-crosshair' : 'cursor-default'}`}
            />
          </div>
        </div>
      )}

      {block.type === 'graph' && (
        <div className={drawingShellClass}>
          <div className={`px-3 py-2 flex flex-wrap items-center gap-2 ${showBlockFrames ? 'border-b border-[var(--color-ink)]/10' : ''}`}>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-light)]">Graph</span>
            {isOwner && (
              <select
                value={graphMode}
                onChange={(e) => updateGraphMeta({ graphMode: e.target.value as GraphMode })}
                className="text-xs rounded-md border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-1"
              >
                <option value="function">Function</option>
                <option value="geometry">Geometry</option>
              </select>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1 text-[11px] text-[var(--color-ink-light)]">
              <span>x</span>
              <input
                key={`xMin-${graphViewport.xMin}`}
                type="text"
                defaultValue={String(graphViewport.xMin)}
                disabled={!isOwner}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) updateGraphMeta({ graphXMin: next });
                }}
                className="w-16 rounded border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-0.5 text-[11px] disabled:opacity-60"
              />
              <span>to</span>
              <input
                key={`xMax-${graphViewport.xMax}`}
                type="text"
                defaultValue={String(graphViewport.xMax)}
                disabled={!isOwner}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) updateGraphMeta({ graphXMax: next });
                }}
                className="w-16 rounded border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-0.5 text-[11px] disabled:opacity-60"
              />
              <span>y</span>
              <input
                key={`yMin-${graphViewport.yMin}`}
                type="text"
                defaultValue={String(graphViewport.yMin)}
                disabled={!isOwner}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) updateGraphMeta({ graphYMin: next });
                }}
                className="w-16 rounded border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-0.5 text-[11px] disabled:opacity-60"
              />
              <span>to</span>
              <input
                key={`yMax-${graphViewport.yMax}`}
                type="text"
                defaultValue={String(graphViewport.yMax)}
                disabled={!isOwner}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) updateGraphMeta({ graphYMax: next });
                }}
                className="w-16 rounded border border-[var(--color-ink)]/15 bg-[var(--color-paper)] px-1.5 py-0.5 text-[11px] disabled:opacity-60"
              />
            </div>
          </div>

          <div className="p-3 flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(200px,38%)_1fr] gap-3">
            {isOwner ? (
              <textarea
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full h-full min-h-[130px] overflow-auto hover-scroll bg-white/60 rounded-md border border-[var(--color-ink)]/15 p-2 text-sm font-mono outline-none resize-none"
                placeholder={
                  graphMode === 'function'
                    ? 'sin(x)\ncos(x)\n0.5*x^2 - 1'
                    : 'point 0 0 O\nsegment -4 -1 3 2\nline 0 0 1 1\ncircle 0 0 3\npolygon -2 -1 0 2 2 -1'
                }
              />
            ) : (
              <pre className="w-full h-full min-h-[130px] bg-white/40 rounded-md border border-[var(--color-ink)]/10 p-2 text-xs font-mono whitespace-pre-wrap overflow-auto hover-scroll">
                {block.content || (graphMode === 'function' ? 'No function input' : 'No geometry commands')}
              </pre>
            )}

            <div className="flex flex-col min-h-0">
              <canvas
                ref={graphCanvasRef}
                width={graphCanvasWidth}
                height={graphCanvasHeight}
                className={`w-full bg-white rounded-md ${showBlockFrames ? 'border border-[var(--color-ink)]/15' : 'border border-transparent'}`}
              />
              <div className="mt-2 text-[11px] text-[var(--color-ink-light)] leading-relaxed">
                {graphMode === 'function'
                  ? 'Function mode: one expression per line, e.g. sin(x), x^2, sqrt(abs(x)).'
                  : 'Geometry mode: point x y [label], segment x1 y1 x2 y2, line x1 y1 x2 y2, circle cx cy r, polygon x1 y1 x2 y2 x3 y3 ...'}
              </div>
              {graphMode === 'function' && graphFunctionErrors.length > 0 && (
                <div className="mt-1 text-[11px] text-[var(--color-accent)]">
                  Invalid line skipped: {graphFunctionErrors[0]}{graphFunctionErrors.length > 1 ? ` (+${graphFunctionErrors.length - 1})` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
