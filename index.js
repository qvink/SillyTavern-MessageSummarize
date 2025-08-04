import { MODULE_NAME, MODULE_NAME_FANCY } from './src/constants.js';
import { initialize, memory_intercept_messages, get_long_memory, get_short_memory } from './src/main.js';

// Export the functions that SillyTavern needs to see
globalThis.memory_intercept_messages = memory_intercept_messages;

export { MODULE_NAME, MODULE_NAME_FANCY, get_long_memory, get_short_memory };

// Initialize the extension
initialize();
