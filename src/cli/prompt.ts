import * as readline from 'readline';
import { Kernel } from '../core/kernel.js';
import { logger } from '../utils/logger.js';

interface SessionInfo {
  id: string;
  title?: string;
}

export async function runCli(kernel: Kernel): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '>> ',
  });

  // Track current session and sessions list
  let currentSessionId: string | undefined;
  let sessions: SessionInfo[] = [];
  let cancelled = false;

  // Print banner
  console.log('\n  Forge AI Harness v0.1.0');
  console.log('  Type /help for commands, Ctrl+C to quit\n');

  // Graceful shutdown
  const shutdown = (signal: string) => {
    if (cancelled) process.exit(0);
    cancelled = true;
    console.log(`\n${signal} received. Finishing current operation...`);
    if (currentSessionId) {
      kernel.getPluginManager().list().forEach((p) => {
        const hooks = p.getHooks();
        if (hooks.onUnmount) hooks.onUnmount();
      });
    }
    rl.close();
    setTimeout(() => process.exit(0), 500);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  const showPrompt = () => rl.prompt();

  const handleCommand = async (input: string): Promise<void> => {
    const parts = input.slice(1).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? '';
    const arg = parts.slice(1).join(' ').trim();

    switch (command) {
      case 'exit':
      case 'quit':
      case 'q':
        rl.close();
        break;

      case 'help':
        console.log(getHelpText());
        showPrompt();
        break;

      case 'clear':
        if (currentSessionId) {
          const session = kernel.getSession(currentSessionId);
          if (session) {
            session.truncate(0);
            console.log('Conversation cleared.\n');
          }
        }
        showPrompt();
        break;

      case 'session':
        if (arg === 'new' || arg === 'n') {
          const s = await kernel.createSession({ title: 'New Session' });
          currentSessionId = s.id;
          sessions.push({ id: s.id, title: 'New Session' });
          console.log(`Created session: ${s.id}\n`);
          showPrompt();
        } else if (arg === 'list' || arg === 'l') {
          if (sessions.length === 0) {
            console.log('No sessions yet. Run /session new to create one.\n');
          } else {
            console.log('Active sessions:');
            for (const sess of sessions) {
              const marker = sess.id === currentSessionId ? ' *(current)' : '';
              console.log(`  ${sess.id}${marker}`);
            }
            console.log();
          }
          showPrompt();
        } else if (arg.startsWith('switch ') || arg.startsWith('s ')) {
          const targetId = arg.replace(/^(switch|s)\s+/, '').trim();
          if (!targetId) {
            console.log('Usage: /session switch <id>\n');
          } else {
            const session = kernel.getSession(targetId);
            if (session) {
              currentSessionId = targetId;
              console.log(`Switched to session: ${targetId}\n`);
            } else {
              console.log(`Session '${targetId}' not found.\n`);
            }
          }
          showPrompt();
        } else {
          console.log('Unknown session command. Use: /session new, /session list, /session switch <id>\n');
          showPrompt();
        }
        break;

      case 'plugin':
        if (arg === 'list' || arg === 'l' || arg === '') {
          const plugins = kernel.getPluginManager().list();
          if (plugins.length === 0) {
            console.log('No plugins loaded.\n');
          } else {
            console.log('Loaded plugins:');
            for (const p of plugins) {
              console.log(`  [${p.getId()}] ${p.getName()}`);
              for (const t of p.getTools()) {
                console.log(`    - ${t.name}: ${t.description}`);
              }
            }
            console.log();
          }
          showPrompt();
        }
        break;

      case 'status':
        console.log(`Current session: ${currentSessionId ?? '(none)'}`);
        console.log(`Plugins loaded: ${kernel.getPluginManager().list().length}`);
        console.log();
        showPrompt();
        break;

      default:
        console.log('Unknown command. Type /help for options.\n');
        showPrompt();
    }
  };

  const handleInput = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed || cancelled) return;

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      return;
    }

    // Normal chat message
    if (!currentSessionId) {
      const s = await kernel.createSession({ title: 'Chat Session' });
      currentSessionId = s.id;
      sessions.push({ id: s.id, title: 'Chat Session' });
    }

    try {
      const result = await kernel.execute(trimmed, currentSessionId);
      if (result.content) {
        console.log(result.content);
      }
      if (result.usage) {
        console.log(`\n[Tokens: ${result.usage.promptTokens}+${result.usage.completionTokens}=${result.usage.totalTokens}]\n`);
      } else {
        console.log();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Error: ${msg}\n`);
    }

    showPrompt();
  };

  rl.on('line', handleInput);
  showPrompt();
}

function getHelpText(): string {
  return `
Forge CLI — Help
================

Commands (type at the ">>" prompt):

  <text>           Send a message to the agent
  /exit            Exit the CLI
  /help            Show this help text
  /clear           Clear the conversation history for the current session
  /session new     Create a new chat session
  /session list    List active sessions
  /session switch  <id>  Switch to another session
  /plugin list     Show loaded plugins and their tools
  /status          Show current session and agent status

Examples:
  >> Hello, forge!
  >> What can you do?
  /session list
  /plugin list
  /exit
`;
}
