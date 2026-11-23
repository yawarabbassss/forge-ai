/**
 * Hello World Plugin - Handler module
 * This module provides the tool execution logic for the hello-world plugin.
 */

async function greet({ args }) {
  const { name, formality = 'casual' } = args;
  if (formality === 'formal') {
    return {
      success: true,
      greeting: `Good day, ${name}. It is a pleasure to make your acquaintance.`,
    };
  }
  return {
    success: true,
    greeting: `Hey ${name}! Nice to meet you! 😊`,
  };
}

async function calculate({ args }) {
  const { a, b, operation } = args;
  let result;
  switch (operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) {
        return { success: false, error: 'Division by zero is not allowed.' };
      }
      result = a / b;
      break;
    default:
      return { success: false, error: `Unknown operation: ${operation}` };
  }
  return {
    success: true,
    expression: `${a} ${operation.replace('add', '+').replace('subtract', '-').replace('multiply', '×').replace('divide', '÷')} ${b}`,
    result,
  };
}

// Export hook functions for the Forge plugin system
module.exports.hooks = {
  execute: async ({ tool, args }) => {
    switch (tool) {
      case 'greet':
        return await greet({ args });
      case 'calculate':
        return await calculate({ args });
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  },
};

// Lifecycle hooks (optional)
module.exports.onMount = async () => {
  console.log('[hello-world] Plugin mounted');
};

module.exports.onUnmount = async () => {
  console.log('[hello-world] Plugin unmounted');
};
