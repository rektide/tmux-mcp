import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from 'uuid';

const exec = promisify(execCallback);

// Basic interfaces for tmux objects
export interface TmuxSession {
  id: string;
  name: string;
  attached: boolean;
  windows: number;
}

export interface TmuxWindow {
  id: string;
  name: string;
  active: boolean;
  sessionId: string;
}

export interface ChildProcess {
  pid: number;
  ppid: number;
  pgid: number;
  command: string;
  cpu?: string;
  memory?: string;
  cwd?: string;
  startTime?: string;
  state?: string;
  user?: string;
}

export interface TmuxPane {
  id: string;
  windowId: string;
  active: boolean;
  title: string;
  pid?: number;
  currentCommand?: string;
  startCommand?: string;
  currentPath?: string;
  startPath?: string;
  tty?: string;
  sessionId?: string;
  sessionName?: string;
  windowName?: string;
  dead?: boolean;
  exitStatus?: number;
  exitSignal?: number;
  childProcesses?: ChildProcess[];
}

export interface ProcessFilterOptions {
  paneId?: string;
  windowId?: string;
  sessionId?: string;
  sessionName?: string;
  pid?: number;
  currentCommand?: string | string[];
  startCommand?: string | string[];
  currentPath?: string | string[];
  startPath?: string | string[];
  tty?: string | string[];
}

export type ProcessInfoFields =
  | 'paneId'
  | 'windowId'
  | 'windowName'
  | 'sessionId'
  | 'sessionName'
  | 'active'
  | 'title'
  | 'pid'
  | 'currentCommand'
  | 'startCommand'
  | 'currentPath'
  | 'startPath'
  | 'tty'
  | 'dead'
  | 'exitStatus'
  | 'exitSignal';

export interface ListProcessesOptions {
  sessionTarget?: string;
  filter?: ProcessFilterOptions;
  fields?: ProcessInfoFields[];
  includeChildProcesses?: boolean;
  childProcessFields?: ('pid' | 'ppid' | 'pgid' | 'command' | 'cpu' | 'memory' | 'cwd' | 'startTime' | 'state' | 'user')[];
}

interface CommandExecution {
  id: string;
  paneId: string;
  command: string;
  status: 'pending' | 'completed' | 'error';
  startTime: Date;
  result?: string;
  exitCode?: number;
  rawMode?: boolean;
}

export type ShellType = 'bash' | 'zsh' | 'fish';

let shellConfig: { type: ShellType } = { type: 'bash' };

export function setShellConfig(config: { type: string }): void {
  // Validate shell type
  const validShells: ShellType[] = ['bash', 'zsh', 'fish'];

  if (validShells.includes(config.type as ShellType)) {
    shellConfig = { type: config.type as ShellType };
  } else {
    shellConfig = { type: 'bash' };
  }
}

/**
 * Execute a tmux command and return the result
 */
export async function executeTmux(tmuxCommand: string): Promise<string> {
  try {
    const { stdout } = await exec(`tmux ${tmuxCommand}`);
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`Failed to execute tmux command: ${error.message}`);
  }
}

/**
 * Check if tmux server is running
 */
export async function isTmuxRunning(): Promise<boolean> {
  try {
    await executeTmux("list-sessions -F '#{session_name}'");
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<TmuxSession[]> {
  const format = "#{session_id}:#{session_name}:#{?session_attached,1,0}:#{session_windows}";
  const output = await executeTmux(`list-sessions -F '${format}'`);

  if (!output) return [];

  return output.split('\n').map(line => {
    const [id, name, attached, windows] = line.split(':');
    return {
      id,
      name,
      attached: attached === '1',
      windows: parseInt(windows, 10)
    };
  });
}

/**
 * Find a session by name
 */
export async function findSessionByName(name: string): Promise<TmuxSession | null> {
  try {
    const sessions = await listSessions();
    return sessions.find(session => session.name === name) || null;
  } catch (error) {
    return null;
  }
}

/**
 * List windows in a session
 */
export async function listWindows(sessionId: string): Promise<TmuxWindow[]> {
  const format = "#{window_id}:#{window_name}:#{?window_active,1,0}";
  const output = await executeTmux(`list-windows -t '${sessionId}' -F '${format}'`);

  if (!output) return [];

  return output.split('\n').map(line => {
    const [id, name, active] = line.split(':');
    return {
      id,
      name,
      active: active === '1',
      sessionId
    };
  });
}

export async function getChildProcesses(parentPid: number, fields?: ('pid' | 'ppid' | 'pgid' | 'command' | 'cpu' | 'memory' | 'cwd' | 'startTime' | 'state' | 'user')[]): Promise<ChildProcess[]> {
  const childFields = fields || ['pid', 'ppid', 'pgid', 'command', 'cpu', 'memory', 'cwd', 'startTime', 'state', 'user'];

  const fieldMapping: Record<string, string> = {
    pid: 'pid',
    ppid: 'ppid',
    pgid: 'pgid',
    command: 'comm',
    cpu: '%cpu',
    memory: '%mem',
    cwd: 'cwd',
    startTime: 'lstart',
    state: 'state',
    user: 'user'
  };

  const psFields = childFields.map(f => fieldMapping[f] || f).join(',');

  try {
    const { stdout } = await exec(`ps -o ${psFields} --ppid ${parentPid} --no-headers`);

    if (!stdout.trim()) return [];

    const processes: ChildProcess[] = [];

    for (const line of stdout.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);

      if (parts.length < 2) continue;

      const child: ChildProcess = {} as ChildProcess;
      let currentFieldIndex = 0;

      childFields.forEach((field) => {
        switch (field) {
          case 'pid':
            child.pid = parseInt(parts[currentFieldIndex], 10);
            currentFieldIndex++;
            break;
          case 'ppid':
            child.ppid = parseInt(parts[currentFieldIndex], 10);
            currentFieldIndex++;
            break;
          case 'pgid':
            child.pgid = parseInt(parts[currentFieldIndex], 10);
            currentFieldIndex++;
            break;
          case 'command':
            child.command = parts.slice(currentFieldIndex).join(' ');
            currentFieldIndex = parts.length;
            break;
          case 'cpu':
            child.cpu = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
          case 'memory':
            child.memory = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
          case 'cwd':
            child.cwd = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
          case 'startTime':
            child.startTime = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
          case 'state':
            child.state = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
          case 'user':
            child.user = parts[currentFieldIndex];
            currentFieldIndex++;
            break;
        }
      });

      processes.push(child);
    }

    return processes;
  } catch (error: any) {
    return [];
  }
}

export async function listProcesses(options?: ListProcessesOptions): Promise<TmuxPane[]> {
  const fields = options?.fields || [
    'paneId',
    'windowId',
    'windowName',
    'sessionId',
    'sessionName',
    'active',
    'title',
    'pid',
    'currentCommand',
    'startCommand',
    'currentPath',
    'startPath',
    'tty',
    'dead',
    'exitStatus',
    'exitSignal'
  ];

  const formatMapping: Record<ProcessInfoFields, string> = {
    paneId: '#{pane_id}',
    windowId: '#{window_id}',
    windowName: '#{window_name}',
    sessionId: '#{session_id}',
    sessionName: '#{session_name}',
    active: '#{?pane_active,1,0}',
    title: '#{pane_title}',
    pid: '#{pane_pid}',
    currentCommand: '#{pane_current_command}',
    startCommand: '#{pane_start_command}',
    currentPath: '#{pane_current_path}',
    startPath: '#{pane_start_path}',
    tty: '#{pane_tty}',
    dead: '#{?pane_dead,1,0}',
    exitStatus: '#{pane_dead_status}',
    exitSignal: '#{pane_dead_signal}'
  };

  const formatStr = fields.map(f => formatMapping[f]).join(':');

  let command = 'list-panes -a';

  if (options?.sessionTarget) {
    command += ` -t '${options.sessionTarget}'`;
  }

  command += ` -F '${formatStr}'`;

  const output = await executeTmux(command);

  if (!output) return [];

  const results: TmuxPane[] = [];

  for (const line of output.split('\n')) {
    const values = line.split(':');
    const pane: TmuxPane = {} as TmuxPane;

    fields.forEach((field, index) => {
      const value = values[index];

      switch (field) {
        case 'paneId':
          pane.id = value;
          break;
        case 'windowId':
          pane.windowId = value;
          break;
        case 'windowName':
          pane.windowName = value;
          break;
        case 'sessionId':
          pane.sessionId = value;
          break;
        case 'sessionName':
          pane.sessionName = value;
          break;
        case 'active':
          pane.active = value === '1';
          break;
        case 'title':
          pane.title = value || '';
          break;
        case 'pid':
          pane.pid = value ? parseInt(value, 10) : undefined;
          break;
        case 'currentCommand':
          pane.currentCommand = value || undefined;
          break;
        case 'startCommand':
          pane.startCommand = value || undefined;
          break;
        case 'currentPath':
          pane.currentPath = value || undefined;
          break;
        case 'startPath':
          pane.startPath = value || undefined;
          break;
        case 'tty':
          pane.tty = value || undefined;
          break;
        case 'dead':
          pane.dead = value === '1';
          break;
        case 'exitStatus':
          pane.exitStatus = value ? parseInt(value, 10) : undefined;
          break;
        case 'exitSignal':
          pane.exitSignal = value ? parseInt(value, 10) : undefined;
          break;
      }
    });

    if (passesFilter(pane, options?.filter)) {
      if (options?.includeChildProcesses && pane.pid) {
        pane.childProcesses = await getChildProcesses(pane.pid, options.childProcessFields);
      }
      results.push(pane);
    }
  }

  return results;
}

function passesFilter(pane: TmuxPane, filter?: ProcessFilterOptions): boolean {
  if (!filter) return true;

  if (filter.paneId !== undefined && pane.id !== filter.paneId) return false;
  if (filter.windowId !== undefined && pane.windowId !== filter.windowId) return false;
  if (filter.sessionId !== undefined && pane.sessionId !== filter.sessionId) return false;
  if (filter.sessionName !== undefined && pane.sessionName !== filter.sessionName) return false;
  if (filter.pid !== undefined && pane.pid !== filter.pid) return false;

  if (filter.currentCommand !== undefined) {
    const currentCommands = Array.isArray(filter.currentCommand) ? filter.currentCommand : [filter.currentCommand];
    if (pane.currentCommand && !currentCommands.includes(pane.currentCommand)) return false;
  }

  if (filter.startCommand !== undefined) {
    const startCommands = Array.isArray(filter.startCommand) ? filter.startCommand : [filter.startCommand];
    if (pane.startCommand && !startCommands.includes(pane.startCommand)) return false;
  }

  if (filter.currentPath !== undefined) {
    const currentPaths = Array.isArray(filter.currentPath) ? filter.currentPath : [filter.currentPath];
    if (pane.currentPath && !currentPaths.includes(pane.currentPath)) return false;
  }

  if (filter.startPath !== undefined) {
    const startPaths = Array.isArray(filter.startPath) ? filter.startPath : [filter.startPath];
    if (pane.startPath && !startPaths.includes(pane.startPath)) return false;
  }

  if (filter.tty !== undefined) {
    const ttys = Array.isArray(filter.tty) ? filter.tty : [filter.tty];
    if (pane.tty && !ttys.includes(pane.tty)) return false;
  }

  if (filter.currentPath !== undefined) {
    const currentPaths = Array.isArray(filter.currentPath) ? filter.currentPath : [filter.currentPath];
    if (pane.currentPath && !currentPaths.includes(pane.currentPath)) return false;
  }

  if (filter.startPath !== undefined) {
    const startPaths = Array.isArray(filter.startPath) ? filter.startPath : [filter.startPath];
    if (pane.startPath && !startPaths.includes(pane.startPath)) return false;
  }

  if (filter.tty !== undefined) {
    const ttys = Array.isArray(filter.tty) ? filter.tty : [filter.tty];
    if (pane.tty && !ttys.includes(pane.tty)) return false;
  }

  return true;
}

/**
 * List panes in a window
 */
export async function listPanes(windowId: string): Promise<TmuxPane[]> {
  const format = "#{pane_id}:#{pane_title}:#{?pane_active,1,0}";
  const output = await executeTmux(`list-panes -t '${windowId}' -F '${format}'`);

  if (!output) return [];

  return output.split('\n').map(line => {
    const [id, title, active] = line.split(':');
    return {
      id,
      windowId,
      title: title,
      active: active === '1'
    };
  });
}

/**
 * Capture content from a specific pane, by default the latest 200 lines.
 */
export async function capturePaneContent(paneId: string, lines: number = 200, includeColors: boolean = false): Promise<string> {
  const colorFlag = includeColors ? '-e' : '';
  return executeTmux(`capture-pane -p ${colorFlag} -t '${paneId}' -S -${lines} -E -`);
}

/**
 * Create a new tmux session
 */
export async function createSession(name: string): Promise<TmuxSession | null> {
  await executeTmux(`new-session -d -s "${name}"`);
  return findSessionByName(name);
}

/**
 * Create a new window in a session
 */
export async function createWindow(sessionId: string, name: string): Promise<TmuxWindow | null> {
  const output = await executeTmux(`new-window -t '${sessionId}' -n '${name}'`);
  const windows = await listWindows(sessionId);
  return windows.find(window => window.name === name) || null;
}

/**
 * Kill a tmux session by ID
 */
export async function killSession(sessionId: string): Promise<void> {
  await executeTmux(`kill-session -t '${sessionId}'`);
}

/**
 * Kill a tmux window by ID
 */
export async function killWindow(windowId: string): Promise<void> {
  await executeTmux(`kill-window -t '${windowId}'`);
}

/**
 * Kill a tmux pane by ID
 */
export async function killPane(paneId: string): Promise<void> {
  await executeTmux(`kill-pane -t '${paneId}'`);
}

/**
 * Split a tmux pane horizontally or vertically
 */
export async function splitPane(
  targetPaneId: string,
  direction: 'horizontal' | 'vertical' = 'vertical',
  size?: number
): Promise<TmuxPane | null> {
  // Build the split-window command
  let splitCommand = 'split-window';

  // Add direction flag (-h for horizontal, -v for vertical)
  if (direction === 'horizontal') {
    splitCommand += ' -h';
  } else {
    splitCommand += ' -v';
  }

  // Add target pane
  splitCommand += ` -t '${targetPaneId}'`;

  // Add size if specified (as percentage)
  if (size !== undefined && size > 0 && size < 100) {
    splitCommand += ` -p ${size}`;
  }

  // Execute the split command
  await executeTmux(splitCommand);

  // Get the window ID from the target pane to list all panes
  const windowInfo = await executeTmux(`display-message -p -t '${targetPaneId}' '#{window_id}'`);

  // List all panes in the window to find the newly created one
  const panes = await listPanes(windowInfo);

  // The newest pane is typically the last one in the list
  return panes.length > 0 ? panes[panes.length - 1] : null;
}

// Map to track ongoing command executions
const activeCommands = new Map<string, CommandExecution>();

const startMarkerText = 'TMUX_MCP_START';
const endMarkerPrefix = "TMUX_MCP_DONE_";

// Execute a command in a tmux pane and track its execution
export async function executeCommand(paneId: string, command: string, rawMode?: boolean, noEnter?: boolean): Promise<string> {
  // Generate unique ID for this command execution
  const commandId = uuidv4();

  let fullCommand: string;
  if (rawMode || noEnter) {
    fullCommand = command;
  } else {
    const endMarkerText = getEndMarkerText();
    fullCommand = `echo "${startMarkerText}"; ${command}; echo "${endMarkerText}"`;
  }

  // Store command in tracking map
  activeCommands.set(commandId, {
    id: commandId,
    paneId,
    command,
    status: 'pending',
    startTime: new Date(),
    rawMode: rawMode || noEnter
  });

  // Send the command to the tmux pane
  if (noEnter) {
    // Check if this is a special key (e.g., Up, Down, Left, Right, Escape, Tab, etc.)
    // Special keys in tmux are typically capitalized or have special names
    const specialKeys = ['Up', 'Down', 'Left', 'Right', 'Escape', 'Tab', 'Enter', 'Space',
      'BSpace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

    if (specialKeys.includes(fullCommand)) {
      // Send special key as-is
      await executeTmux(`send-keys -t '${paneId}' ${fullCommand}`);
    } else {
      // For regular text, send each character individually to ensure proper processing
      // This handles both single characters (like 'q', 'f') and strings (like 'beam')
      for (const char of fullCommand) {
        await executeTmux(`send-keys -t '${paneId}' '${char.replace(/'/g, "'\\''")}'`);
      }
    }
  } else {
    await executeTmux(`send-keys -t '${paneId}' '${fullCommand.replace(/'/g, "'\\''")}' Enter`);
  }

  return commandId;
}

export async function checkCommandStatus(commandId: string): Promise<CommandExecution | null> {
  const command = activeCommands.get(commandId);
  if (!command) return null;

  if (command.status !== 'pending') return command;

  const content = await capturePaneContent(command.paneId, 1000);

  if (command.rawMode) {
    command.result = 'Status tracking unavailable for rawMode commands. Use capture-pane to monitor interactive apps instead.';
    return command;
  }

  // Find the last occurrence of the markers
  const startIndex = content.lastIndexOf(startMarkerText);
  const endIndex = content.lastIndexOf(endMarkerPrefix);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    command.result = "Command output could not be captured properly";
    return command;
  }

  // Extract exit code from the end marker line
  const endLine = content.substring(endIndex).split('\n')[0];
  const endMarkerRegex = new RegExp(`${endMarkerPrefix}(\\d+)`);
  const exitCodeMatch = endLine.match(endMarkerRegex);

  if (exitCodeMatch) {
    const exitCode = parseInt(exitCodeMatch[1], 10);

    command.status = exitCode === 0 ? 'completed' : 'error';
    command.exitCode = exitCode;

    // Extract output between the start and end markers
    const outputStart = startIndex + startMarkerText.length;
    const outputContent = content.substring(outputStart, endIndex).trim();

    command.result = outputContent.substring(outputContent.indexOf('\n') + 1).trim();

    // Update in map
    activeCommands.set(commandId, command);
  }

  return command;
}

// Get command by ID
export function getCommand(commandId: string): CommandExecution | null {
  return activeCommands.get(commandId) || null;
}

// Get all active command IDs
export function getActiveCommandIds(): string[] {
  return Array.from(activeCommands.keys());
}

// Clean up completed commands older than a certain time
export function cleanupOldCommands(maxAgeMinutes: number = 60): void {
  const now = new Date();

  for (const [id, command] of activeCommands.entries()) {
    const ageMinutes = (now.getTime() - command.startTime.getTime()) / (1000 * 60);

    if (command.status !== 'pending' && ageMinutes > maxAgeMinutes) {
      activeCommands.delete(id);
    }
  }
}

function getEndMarkerText(): string {
  return shellConfig.type === 'fish'
    ? `${endMarkerPrefix}$status`
    : `${endMarkerPrefix}$?`;
}

