#!/usr/bin/env node

import { cli, define } from 'gunshi'
import * as tmux from './tmux.js'

const listProcessesCommand = define({
  name: 'list-processes',
  description: 'List tmux pane processes with optional filtering',
  args: {
    session: {
      type: 'string',
      short: 's',
      description: 'Target session (by ID or name)'
    },
    paneId: {
      type: 'string',
      description: 'Filter by pane ID'
    },
    windowId: {
      type: 'string',
      description: 'Filter by window ID'
    },
    sessionId: {
      type: 'string',
      description: 'Filter by session ID'
    },
    sessionName: {
      type: 'string',
      description: 'Filter by session name'
    },
    pid: {
      type: 'number',
      description: 'Filter by process PID'
    },
    currentCommand: {
      type: 'string',
      description: 'Filter by current command name'
    },
    startCommand: {
      type: 'string',
      description: 'Filter by start command name'
    },
    currentPath: {
      type: 'string',
      description: 'Filter by current working directory path'
    },
    startPath: {
      type: 'string',
      description: 'Filter by start path'
    },
    tty: {
      type: 'string',
      description: 'Filter by TTY device'
    },
    fields: {
      type: 'string',
      description: 'Select which fields to include (comma-separated: paneId,windowId,windowName,sessionId,sessionName,active,title,pid,currentCommand,startCommand,currentPath,startPath,tty,dead,exitStatus,exitSignal)'
    },
    includeChildProcesses: {
      type: 'boolean',
      description: 'Include child processes of each pane'
    },
    childProcessFields: {
      type: 'string',
      description: 'Select child process fields (comma-separated: pid,ppid,pgid,command,cpu,memory,cwd,startTime,state,user)'
    },
    json: {
      type: 'boolean',
      short: 'j',
      description: 'Output as JSON'
    }
  },
  run: async ctx => {
    const {
      session,
      paneId,
      windowId,
      sessionId,
      sessionName,
      pid,
      currentCommand,
      startCommand,
      currentPath,
      startPath,
      tty,
      fields,
      includeChildProcesses,
      childProcessFields,
      json
    } = ctx.values

    const filter: tmux.ProcessFilterOptions = {}
    if (paneId) filter.paneId = paneId
    if (windowId) filter.windowId = windowId
    if (sessionId) filter.sessionId = sessionId
    if (sessionName) filter.sessionName = sessionName
    if (pid !== undefined) filter.pid = pid
    if (currentCommand) filter.currentCommand = currentCommand
    if (startCommand) filter.startCommand = startCommand
    if (currentPath) filter.currentPath = currentPath
    if (startPath) filter.startPath = startPath
    if (tty) filter.tty = tty

    const allFields: tmux.ProcessInfoFields[] = [
      'paneId', 'windowId', 'windowName', 'sessionId', 'sessionName',
      'active', 'title', 'pid', 'currentCommand', 'startCommand',
      'currentPath', 'startPath', 'tty', 'dead', 'exitStatus', 'exitSignal'
    ]

    const selectedFields = fields
      ? (fields.split(',') as tmux.ProcessInfoFields[])
      : undefined

    const allChildFields: ('pid' | 'ppid' | 'pgid' | 'command' | 'cpu' | 'memory' | 'cwd' | 'startTime' | 'state' | 'user')[] = [
      'pid', 'ppid', 'pgid', 'command', 'cpu', 'memory', 'cwd', 'startTime', 'state', 'user'
    ]

    const selectedChildFields = childProcessFields
      ? (childProcessFields.split(',') as typeof allChildFields)
      : undefined

    const processes = await tmux.listProcesses({
      sessionTarget: session,
      filter,
      fields: selectedFields,
      includeChildProcesses,
      childProcessFields: selectedChildFields
    })

    if (json) {
      console.log(JSON.stringify(processes, null, 2))
      return
    }

    console.table(processes)
  }
})

const mainCommand = define({
  name: 'tmux-mcp-cli',
  description: 'Tmux MCP Server CLI',
  run: () => {
    console.log('Available commands:')
    console.log('  list-processes    List tmux pane processes')
    console.log('')
    console.log('Run "tmux-mcp-cli <command> --help" for more information on a specific command.')
  }
})

await cli(process.argv.slice(2), mainCommand, {
  name: 'tmux-mcp-cli',
  version: '0.2.2',
  subCommands: {
    'list-processes': listProcessesCommand
  }
})
