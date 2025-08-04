import { MODULE_NAME, MODULE_NAME_FANCY } from './src/constants.js';
import { initialize, memory_intercept_messages, get_long_memory, get_short_memory } from './src/main.js';

// Export the functions that SillyTavern needs to see
globalThis.memory_intercept_messages = memory_intercept_messages;
globalThis.get_long_memory = get_long_memory;
globalThis.get_short_memory = get_short_memory;

export { MODULE_NAME, MODULE_NAME_FANCY };

// Initialize the extension
initialize();
