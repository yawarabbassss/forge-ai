export const HELP_TEXT = `
Forge CLI — Help
================

Commands (type at the ">>" prompt):

  <text>           Send a message to the agent
  /exit            Exit the CLI
  /quit            Same as /exit
  /help            Show this help text
  /clear           Clear the conversation history for the current session
  /session new     Create a new chat session
  /session list    List active sessions
  /session switch  <id>  Switch to another session
  /plugin list     Show loaded plugins and their tools
  /plugin reload   Reload all plugins from disk
  /status          Show current session and agent status
  /provider        Show current provider configuration
  /config          Show full configuration

Examples:
  >> Hello, forge!
  >> What can you do?
  /session list
  /plugin list
  /exit
`;

export function isCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

export interface CommandResult {
  handled: true;
  command: string;
  exit?: boolean;
  clear?: boolean;
  newSession?: boolean;
  switchSession?: string | null;
  argument?: string;
}

export function parseCommand(input: string): CommandResult | null {
  const trimmed = input.trim();
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? '';
  const argument = parts.slice(1).join(' ').trim();

  switch (command) {
    case 'exit':
    case 'quit':
    case 'q':
      return { handled: true, command, exit: true };

    case 'help':
      return { handled: true, command };

    case 'clear':
      return { handled: true, command, clear: true };

    case 'session':
      if (argument === 'new' || argument === 'n') {
        return { handled: true, command, newSession: true };
      }
      if (argument === 'list' || argument === 'l') {
        return { handled: true, command };
      }
      if (argument.startsWith('switch ') || argument.startsWith('s ')) {
        const sessionId = argument.replace(/^(switch|s)\s+/, '').trim();
        return { handled: true, command, switchSession: sessionId || null };
      }
      if (argument === 'switch' || argument === 's') {
        return { handled: true, command, switchSession: null };
      }
      return null; // Not a recognized session sub-command

    case 'plugin':
      if (argument === 'list' || argument === 'l') {
        return { handled: true, command };
      }
      if (argument === 'reload') {
        return { handled: true, command, argument: 'reload' };
      }
      return null;

    case 'status':
      return { handled: true, command };

    case 'provider':
      return { handled: true, command, argument };

    case 'config':
      return { handled: true, command, argument };

    default:
      return null;
  }
}
